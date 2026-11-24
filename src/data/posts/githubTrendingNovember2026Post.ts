import { BlogPost } from '@/types/blog';

export const githubTrendingNovember2026Post: BlogPost = {
  id: 'github-trending-open-source-november-2026',
  slug: 'github-trending-open-source-november-2026',
  title: 'GitHub Trending: The 20 Fastest-Rising New Open Source Projects (November 2026)',
  excerpt: 'The 20 new open source projects that gained the most GitHub stars in their first month, from a tool that explains how any software works to on-device AI agents, a Rust download manager and a container runtime.',
  content: `Every month a handful of brand-new repositories go from zero to tens of thousands of GitHub stars. This list tracks them. We searched GitHub for every public project created between 24 October and 24 November 2026, ranked them by stars, and kept the 20 biggest that are open source and safe to recommend.

**The short answer:** November belonged to AI agents and to Rust. Craft Anything, a tool that explains how any piece of software works, gained 42,546 stars in under four weeks. Two DeepSeek agent projects took second and third. Half of the top 20 are built for AI agents, and four are written in Rust.

![GitHub trending in November 2026: the 10 new open source projects with the most stars, led by craft-anything with 42,546](/media/fig-github-trending-november-2026.jpg)

## How we built this list

- **Window:** public repositories created from 24 October to 24 November 2026.
- **Ranking:** GitHub stars on 24 November 2026, from the GitHub search API.
- **Left out:** console emulators and game recompilations, jailbreak and account or credential tools, image galleries, projects with no description, and one project whose fork count looked inflated.

GitHub's own Trending page counts stars gained by any project, old or new. This list counts only new projects, so it shows what launched this month rather than what already had a following.

## The 20 fastest-rising new projects

1. **[Craft Anything](https://github.com/storytold/craft-anything)** (Rust, 42,546 stars). Points at any app or codebase, explains how it works, then helps you build your own version.
2. **[dsh-Go](https://github.com/ccch1mneyyy/dsh-Go)** (Dart, 31,145 stars). Runs the DeepSeek agent harness on your phone, and lets the phone control your computer.
3. **[DeepSeek Superagent prototype](https://github.com/deepseek-ai/dsh-superagent-prototype)** (TypeScript, 24,439 stars). DeepSeek's own research code for a more autonomous agent system.
4. **[unslop](https://github.com/heydamir/unslop)** (JavaScript, 21,078 stars). An agent skill that turns generic, machine-made interfaces into designed ones.
5. **[Mister Download Manager](https://github.com/anefzaoui/misterdownloadmanager)** (Rust, 17,614 stars). A clean-room download manager written from scratch.
6. **[rea-video](https://github.com/JuneYaooo/rea-video)** (Python, 12,887 stars). Breaks any video down shot by shot and shows how to remake it.
7. **[kiri](https://github.com/libracoder/kiri)** (Rust, 12,803 stars). A small, fast container runtime for macOS, Windows and Linux, with a free tunnel built in.
8. **[Jane Street agent skills](https://github.com/janestreet/agent_skills)** (11,505 stars). The trading firm's published skills for coding agents.
9. **[Mika](https://github.com/wangzan101/Mika)** (Kotlin, 9,835 stars). An on-device Android agent that operates apps and the web for you.
10. **[apkstart](https://github.com/RoutineMiku/apkstart)** (JavaScript, 9,610 stars). Double-click an Android APK on Windows and it runs in its own window.
11. **[rust-anything](https://github.com/erkamyaman/rust-anything)** (Rust, 9,031 stars). Ports an app to Rust one piece at a time, checking each piece against the original.
12. **[pixelfx](https://github.com/patch-gg/pixelfx)** (JavaScript, 8,975 stars). 244 pixel art effects, each a small piece of code.
13. **[Claude-Cage](https://github.com/Lee-xeo/Claude-Cage)** (Go, 8,257 stars). A lightweight virtual machine that keeps a coding agent from leaking data over the network.
14. **[SoduWork](https://github.com/mdiri-ai/SoduWork)** (JavaScript, 7,535 stars). A self-hosted workspace where teams and their agents share the same tasks.
15. **[Vercel Labs UI](https://github.com/vercel-labs/ui)** (TypeScript, 7,035 stars). A library of interface behaviours built for agents to use.
16. **[BLA](https://github.com/qybaihe/bla)** (TypeScript, 6,671 stars). An open source defence server and command line tool that protects JavaScript and Electron apps from agent attacks.
17. **[floorplan](https://github.com/haydenschmitty/floorplan)** (JavaScript, 6,561 stars). Draws an interactive, plain-English map of your codebase.
18. **[agent-autoloop](https://github.com/KKKKhazix/agent-autoloop)** (TypeScript, 6,458 stars). Lets a command line agent pick up and finish work in the background, and asks you only when it is unsure.
19. **[phonebox](https://github.com/ersinkoc/phonebox)** (JavaScript, 5,679 stars). Turns an old Android phone into a touch control deck for your desktop.
20. **[DeepSeek chat demo](https://github.com/deepseek-ai/chat-demo)** (TypeScript, 5,379 stars). DeepSeek's reference chat app.

## Three trends from November

**Agents moved onto your own devices.** dsh-Go runs DeepSeek's agent on a phone, Mika drives Android apps on the device itself, and agent-autoloop and Claude-Cage keep coding agents working, and contained, on your own machine. The pitch is privacy and control: your hardware does the work, not someone else's server.

**Rust keeps winning rewrites.** Craft Anything, Mister Download Manager, kiri and rust-anything are Rust projects, and rust-anything exists only to help other apps move to Rust. Another Rust project, fast-anything, launched on 21 November with the opposite advice: rewrite only the slow 5%.

**Console recompilation exploded.** Several of the month's most-starred new repositories run console games natively on PC, Mac or iPhone. We left them off the list because their legal status depends on where you live and where your game files came from.

## Why Riftn tracks open source

Riftn is a social media protocol, and its web app is open source too. We publish this list every month alongside our [top 50 most active open source projects of 2026](/guides/top-50-most-active-open-source-projects-2026), which ranks long-running projects by commits and contributors rather than by stars.

Builders share launches, demos and release notes on Riftn every day. [Follow the open source conversation on Riftn](https://riftn.com).

## Frequently asked questions

### What is trending on GitHub this month?

In November 2026 the fastest-rising new project is Craft Anything, with 42,546 stars in under four weeks. DeepSeek's dsh-Go and Superagent prototype follow.

### How is this different from the GitHub Trending page?

GitHub Trending counts stars gained by any repository, including projects that are years old. This list counts only projects created in the last month.

### What are the best open source projects of 2026?

For long-running projects ranked by real activity, see our top 50 most active open source projects of 2026. For new projects, check this list each month.

### When is the next edition?

Early each month. The December 2026 edition covers projects created between 24 November and 24 December.

Data: GitHub search API, queried on 24 November 2026. Star counts change daily.`,
  bannerImage: '/media/github-trending-open-source-november-2026-banner-r2.jpg',
  bannerImageAlt: 'GitHub trending: the fastest-rising new open source projects of November 2026',
  author: { name: 'Riftn Team' },
  publishedAt: '2026-11-24T15:00:00.000Z',
  updatedAt: '2026-11-24T15:00:00.000Z',
  tags: ['Open Source', 'GitHub', 'GitHub Trending', 'AI Agents', 'Rust', 'Riftn'],
  readingTime: 6,
  featured: false,
  status: 'published',
  seoTitle: 'GitHub Trending November 2026: 20 Fastest-Rising Open Source Projects',
  seoDescription: 'The 20 new open source projects that gained the most GitHub stars between 24 October and 24 November 2026, with what each one does and the trends behind them.',
};
