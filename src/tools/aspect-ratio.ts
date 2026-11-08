export const IMAGE_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '9:19.5', '4:3', '3:4', '3:2', '2:3'] as const;

export const ASPECT_RATIO_HINT =
  'Shape of the output, default "1:1" (square). Only this field sets the shape — words in the prompt ("iPhone", ' +
  '"widescreen", "portrait") never do. Pick the ratio of where the picture goes: phone wallpaper or lock screen that ' +
  'fills the screen (iPhone, Galaxy) = "9:19.5"; story, Reels, TikTok = "9:16" (portrait); tablet held upright, poster = "3:4"; book cover, character sheet = "2:3"; avatar = "1:1"; ' +
  'photo print, X post = "3:2"; tablet held sideways, classic monitor = "4:3"; desktop or laptop wallpaper, YouTube ' +
  'cover = "16:9". "Widescreen" on its own means landscape "16:9"; a phone is "9:19.5" or "9:16", never "4:3" (4:3 and 3:2 are landscape).';
