import { BlogPost } from '@/types/blog';

export const claudeOfDutyHowToPlayPost: BlogPost = {
  id: 'claude-of-duty-how-to-play',
  slug: 'claude-of-duty-how-to-play',
  title: 'Claude of Duty: How to Play the Browser Shooter (Controls, Tips, FAQ)',
  excerpt: 'Claude of Duty is a free first-person shooter that runs in your browser and builds every model, texture and sound on your own machine. Here are the controls, the settings that matter and how to get it running smoothly.',
  content: `Claude of Duty is a free first-person shooter that plays in a browser tab. It ships no art at all: every model, texture, weapon and sound is generated in JavaScript on your machine while the level loads. No download, no install and no account.

**The short answer:** open [riftn.com/arcade/claude-of-duty](/arcade/claude-of-duty), press Deploy and wait for the level to build. Move with W, A, S and D, aim and shoot with the mouse, and press R to reload.

![First-person view down a weapon across the generated terrain of Claude of Duty](/arcade/claude-of-duty.webp)

## How to start playing

1. **Open [the game page](/arcade/claude-of-duty)** in Chrome, Edge, Firefox or Safari, on a computer or a phone.
2. **Press Deploy.** A progress bar shows while the game builds its world. This takes from a few seconds to about a minute, depending on your hardware.
3. **Click into the game** so it can lock the mouse, then play. Press Escape to pause or leave.

The game picks a graphics preset for your hardware before it loads: low on weaker machines, medium or high on stronger ones. You can change it later in the settings.

## Controls

- **Move:** W, A, S, D or the arrow keys.
- **Look and shoot:** the mouse.
- **Jump, sprint, crouch, prone:** Space, Shift, C and Z.
- **Reload:** R. The screen tells you when to reload.
- **Grenade:** G. A warning appears when a grenade lands close to you.
- **Melee:** V.
- **Lean left and right:** Q and E.
- **Swap weapons:** 1, 2 or Tab.
- **Flashlight:** T.
- **Pause:** Escape. The pause menu holds the settings and a Leave Game button.
- **On a phone:** move with the on-screen stick and drag to look around.

## Settings worth changing

Press Escape and open the settings:

- **Graphics Preset:** drop it one step if the game stutters.
- **Mouse Sensitivity:** lower it for steadier aim at range.
- **Field of View:** raise it to see more at the edges of the screen.
- **Invert Look:** for players who fly planes the other way.

## Tips to win more fights

- **Crouch or go prone before you shoot at range.** You hold the weapon steadier and present a smaller target.
- **Lean around cover** with Q and E instead of stepping out.
- **Reload behind cover**, never in the open.
- **Pick up ammo** from the ground when the prompt appears.
- **Save grenades** for enemies you cannot see behind cover.

## Why the first load takes a while

Most games download their art. Claude of Duty builds it. The level, the weapons and the sounds are all made from code on your device while the progress bar runs. A stronger graphics card finishes faster.

## Frequently asked questions

### Is Claude of Duty free?

Yes. It is free to play on Riftn, with no account and nothing to install.

### Can I play Claude of Duty on a phone?

Yes. It plays on touchscreens with an on-screen stick for movement and a drag to look. A recent phone gives the smoothest game.

### Why is the screen black when it starts?

The game is still building its world. Wait for the progress bar to finish. If it stalls, lower the graphics preset or try another browser.

### Who made Claude of Duty?

It is an open source game, released under the MIT licence on [GitHub](https://github.com/mshumer/Claude-of-Duty). Riftn hosts it in its free [Arcade](/arcade).

### What other games can I play?

The Riftn Arcade has ten free browser games, including King's Gambit chess and the Street Slayer brawler. See [the best free browser games with no download](/guides/best-free-browser-games-no-download-2026).

Riftn is a social media protocol, and its Arcade is free for everyone. [Play Claude of Duty now](/arcade/claude-of-duty).`,
  bannerImage: '/media/claude-of-duty-how-to-play-banner-r2.jpg',
  bannerImageAlt: 'Claude of Duty: how to play the free browser shooter, with controls and tips',
  author: { name: 'Riftn Team' },
  publishedAt: '2026-11-24T19:00:00.000Z',
  updatedAt: '2026-11-24T19:00:00.000Z',
  tags: ['Claude of Duty', 'Browser Games', 'FPS', 'Riftn Arcade', 'Free Games'],
  readingTime: 4,
  featured: false,
  status: 'published',
  seoTitle: 'Claude of Duty: How to Play, Controls and Tips (Free Browser FPS)',
  seoDescription: 'How to play Claude of Duty, the free browser shooter: every control, the settings that matter, tips to win fights and why the first load takes a minute.',
};
