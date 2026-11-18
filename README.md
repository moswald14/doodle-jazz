# Doodle Jazz

[Listen to Doodle Jazz](https://moswald14.github.io/doodle-jazz/).

Doodle Jazz plays original jazz in your browser. Choose a genre, set the groove, or shuffle the trio. “I dig this!” saves eight chords and their audio to a shelf on this device. Import an editable Dot Wave sound to use it as a player voice.

The band recalls a matching liked progression when a new set starts. With the owner's Doodlekeeper connection configured, the site also saves a signed chord record to Doodlechain. The recording stays on the browser shelf for replay.

“Name this song” connects to the owner's Jazz checkout via the HTTPS gateway in `jazz-site-config.mjs`. Checkout locks a two-cent Ethereum PEPE quote, shows the separate ETH network fee, and waits for a confirmed transfer before requesting a title and beat. The saved title, groove, and chord progression can return in future sets. See the [Keeper Jazz setup](https://github.com/moswald14/doodletick/blob/main/keeper/JAZZ-NAMING.md) for the private OpenAI configuration.

Keep the page open and the device awake. Local volume and mute leave a VDO.Ninja cast running. The browser can speak shuffle updates and the Doodle Clock color when an English speaking voice is installed.

For development, serve this folder with an HTTP server at localhost. The AudioWorklet uses the same origin as the page. The deployed site uses HTTPS.

The music engine and design come from [Doodlekeeper 0.16b](https://github.com/moswald14/doodletick/tree/0.16b/keeper). Doodle Jazz source is licensed under GPL-3.0-only. The [VDO.Ninja SDK license](./vdoninja-sdk-license.txt) covers the vendored casting SDK.
