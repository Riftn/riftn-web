/**
 * The waiting rift of the sign-in hand-off, on a page of its own.
 * Used by the pages a login link or a Telegram return lands on, so they look
 * like the sheet they are about to hand over to. No visible words.
 */
import { RiftMarks } from './SignInHandoff';
import './sign-in-handoff.css';

export function SignInWaitFrame({ label }: { label: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#060709]">
      <div className="signin-rift signin-rift--inline" data-phase="waiting" role="status" aria-label={label}>
        <div className="signin-rift__stage">
          <RiftMarks />
        </div>
      </div>
    </div>
  );
}

export default SignInWaitFrame;
