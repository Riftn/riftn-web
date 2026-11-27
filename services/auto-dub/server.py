"""One bounded worker, deployable on an existing host."""
import hmac
import os
import time
from concurrent.futures import ThreadPoolExecutor
from threading import BoundedSemaphore, Lock

from fastapi import FastAPI, Header, HTTPException

import clips
import live_clips
from handler import handler

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
# One dub renders at a time. A couple more wait their turn here rather than
# being turned away; past that the caller keeps the rest in its own line.
DUB_QUEUE = max(0, int(os.environ.get("DUB_QUEUE", "2")))
slots = BoundedSemaphore(1 + DUB_QUEUE)
executor = ThreadPoolExecutor(max_workers=1)
held = 0
held_lock = Lock()


def hold(change: int) -> None:
    global held
    with held_lock:
        held += change
# Stage clips are ffmpeg only and run on their own thread, one at a time, with
# room for one more stage to wait its turn.
clip_slots = BoundedSemaphore(2)
clip_executor = ThreadPoolExecutor(max_workers=1)
# Live clips: a grab is a few seconds of downloads, a render half a minute of
# ffmpeg. Two at a time, a short line behind them; a viewer waits on these.
live_clip_slots = BoundedSemaphore(6)
live_clip_executor = ThreadPoolExecutor(max_workers=2)


@app.get("/")
def health():
    # dubFree lets the caller skip handing over a dub that would only bounce.
    return {
        "service": "video-dubs",
        "provider": "chatterbox-multilingual-v3",
        "dubFree": max(0, 1 + DUB_QUEUE - held),
        "clips": True,
        "liveClips": True,
    }


def authorized(authorization: str) -> str:
    secret = os.environ.get("DUB_WORKER_SECRET", "")
    if not secret or not hmac.compare_digest(authorization, f"Bearer {secret}"):
        raise HTTPException(403, "Forbidden")
    return secret


def run(job):
    try:
        handler({"input": job})
    finally:
        hold(-1)
        slots.release()


def run_live_clip(job):
    try:
        live_clips.handler(job)
    finally:
        live_clip_slots.release()


def run_clips(job):
    try:
        clips.handler(job)
    finally:
        clip_slots.release()


@app.post("/jobs", status_code=202)
def submit(body: dict, authorization: str = Header(default="")):
    secret = authorized(authorization)
    job = body.get("input") or {}
    if not all(job.get(k) for k in ("dubId", "jobId", "lang", "videoUrl", "uploadUrl", "callbackUrl", "path")):
        raise HTTPException(400, "Incomplete job")
    if not slots.acquire(blocking=False):
        raise HTTPException(503, "Worker busy", headers={"Retry-After": "60"})
    job["secret"] = secret
    # The upload URL ages from now, not from when the render starts.
    job["acceptedAt"] = time.time()
    hold(1)
    try:
        executor.submit(run, job)
    except Exception:
        hold(-1)
        slots.release()
        raise
    return {"id": job["jobId"]}


@app.post("/clips", status_code=202)
def submit_clips(body: dict, authorization: str = Header(default="")):
    secret = authorized(authorization)
    job = body.get("input") or {}
    if not job.get("stageId") or not job.get("recordingUrl") or not job.get("callbackUrl") or not clips.valid_clips(job):
        raise HTTPException(400, "Incomplete job")
    if not clip_slots.acquire(blocking=False):
        raise HTTPException(503, "Worker busy", headers={"Retry-After": "300"})
    job["secret"] = secret
    try:
        clip_executor.submit(run_clips, job)
    except Exception:
        clip_slots.release()
        raise
    return {"id": job["stageId"]}


@app.post("/live-clips", status_code=202)
def submit_live_clip(body: dict, authorization: str = Header(default="")):
    secret = authorized(authorization)
    job = body.get("input") or {}
    if not live_clips.valid(job):
        raise HTTPException(400, "Incomplete job")
    if not live_clip_slots.acquire(blocking=False):
        raise HTTPException(503, "Worker busy", headers={"Retry-After": "30"})
    job["secret"] = secret
    try:
        live_clip_executor.submit(run_live_clip, job)
    except Exception:
        live_clip_slots.release()
        raise
    return {"id": job["jobId"]}
