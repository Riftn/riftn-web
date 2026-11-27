Animated reaction emoji from Noto Emoji Animation by Google, licensed CC BY 4.0
(https://creativecommons.org/licenses/by/4.0/). Source:
https://googlefonts.github.io/noto-emoji-animation/ — resized to 72px animated WebP.
respect.webp is re-animated from the still Noto fist (grip, tense, rise) rather
than the stock punch-in animation.
gem.webp (💎, the tipped-state tip button) is from the same set, converted from
the Noto GIF to 72px animated WebP.

chat/ holds the chat reaction set (99 common emoji), named by codepoint like
Google's files, at 64px. Played once when a reaction lands in a chat
(src/lib/chat-reaction-motion.ts lists them with their loop length).
