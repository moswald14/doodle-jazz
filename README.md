# Doodle Jazz

[Listen to Doodle Jazz](https://moswald14.github.io/doodle-jazz/).

Doodle Jazz plays original jazz in your browser. The live groove and beatMAP are at the top. **Controls** at the bottom groups genre, arrangement, player voices, tempo, and mix.

**I dig this!** saves eight chords, their recording, and the beatMAP that was playing when you clicked. Open **Saved grooves** to hear the original recording, download the editable beatMAP, or choose **Play with band** to hear the saved chord sequence with its drums again. **Bring back saved grooves** lets the band reuse recent rhythms when it recalls liked progressions.

Pair the Keeper's Jazz-only HTTPS address in **Doodlechain connection**. The Keeper signs the chord timeline, editable beatMAP, and recording digest as one receipt. The original recording stays on the browser shelf. When the Keeper is unreachable, the shelf keeps the passage for signing later.

Jazz uses beatMAP for its drums. Expand **Edit beatMAP** below the player to see the current measure and step. **Follow playhead** moves the grid with the music. Pick a measure to keep editing it while the measure buttons show where Jazz is playing. Edits go live at the next bar and follow the trio's tempo and bar length.

The editor opens existing `.beatmap.json` files and exports editable maps, WAV, and MIDI. Choose **Play this program in Jazz** to use the loop program's measure order. With looping off, the program plays once and leaves the drum track quiet until you edit it again. Your draft and drum source are saved in this browser. **Return to band drums** brings back the band's kit.

“Name this song” connects to the owner's Jazz checkout via the HTTPS gateway in `jazz-site-config.mjs`. Checkout locks a two-cent Ethereum PEPE quote, shows the separate ETH network fee, and waits for a confirmed transfer before requesting a title and beat. The saved title, groove, and chord progression can return in future sets. See the [Keeper Jazz setup](https://github.com/moswald14/doodletick/blob/main/keeper/JAZZ-NAMING.md) for the private OpenAI configuration.

Keep the page open and the device awake. Local volume and mute leave a VDO.Ninja cast running. The browser can speak shuffle updates and the Doodle Clock color when an English speaking voice is installed.

For development, serve this folder with an HTTP server at localhost. The AudioWorklet uses the same origin as the page. The deployed site uses HTTPS.

The music engine and design come from [Doodlekeeper 0.16b](https://github.com/moswald14/doodletick/tree/0.16b/keeper). Doodle Jazz source is licensed under GPL-3.0-only. The [VDO.Ninja SDK license](./vdoninja-sdk-license.txt) covers the vendored casting SDK.
