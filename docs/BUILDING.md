# Building DeckWerk from source

Every platform DeckWerk supports can be built from this repository with the
same three commands. This is the path to use if you are on a distribution the
released packages do not cover, on an architecture we do not yet publish, or
you simply want to run your own build.

```bash
git clone https://github.com/kallol-saha/deckwerk.git
cd deckwerk
npm ci
npm run dist
```

The installer lands in `release/`: a `.dmg` on macOS, an `.exe` on Windows, and
an `.AppImage`, `.deb` and `.tar.gz` on Linux. On Windows, read
[Windows](#windows) first: with npm 11 there is one extra step, and the first
build can stop on a privilege error that has a known fix.

## You build for your own machine, not for other people's

`npm run dist` produces packages for **the platform and architecture you run
it on**. There is no cross-build, and this is not a missing feature:

- `ffmpeg-static` and `ffprobe-static` download a binary for the host during
  `npm ci`, and the app ships whatever they fetched.
- The Keynote and PowerPoint importers are PyInstaller freezes, and
  PyInstaller cannot cross-compile — not even between macOS architectures.

If you need packages for several platforms, that is what the release workflow
is for; see [RELEASING.md](RELEASING.md).

## Prerequisites

| | Version |
| --- | --- |
| Node.js | 22 or newer |
| Python | 3.10 or newer |
| git | any |

Releases are built with Node 22 and Python 3.12; newer versions of both work.
Nothing else has to be installed by hand — `npm ci` fetches Electron, and
`npm run dist` fetches the packaging tools it needs.

Python is required to **build**, and is not required to **run**. The Keynote
and PowerPoint importers are each frozen by PyInstaller into a single binary
with the interpreter and every dependency inside it, shipped alongside the app.
Someone who installs DeckWerk from a `.dmg`, an `.exe`, or Flathub imports
`.key` and `.pptx` files on a machine with no Python at all.

```bash
brew install python                          # macOS
sudo apt-get install python3 python3-venv    # Debian/Ubuntu
winget install Python.Python.3.12            # Windows
```

If Python is missing, `npm run dist` stops immediately with those instructions
rather than failing somewhere inside the packaging step.

### Linux

Building needs no extra packages, but *running* an Electron app does. On
Debian and Ubuntu:

```bash
sudo apt-get install -y libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 \
  xdg-utils libatspi2.0-0 libuuid1 libsecret-1-0
```

Installing the `.deb` this build produces pulls those in for you; the
`.AppImage` does not, so install them first if you plan to use it.

### Windows

These steps built a working installer on Windows 11 with Node 24, npm 11 and
Python 3.12 (Miniconda's works). Run them in PowerShell:

```powershell
git clone https://github.com/kallol-saha/deckwerk.git
cd deckwerk
npm ci
node node_modules/electron/install.js
node node_modules/ffmpeg-static/install.js
npm run dist:win
```

The installer is `release\deckwerk-<version>-win-x64-setup.exe`.

**npm 11 skips install scripts until they are approved.** `npm ci` ends with
"3 packages have install scripts not yet covered by allowScripts" (electron,
esbuild, ffmpeg-static). Without the first and last, there is no Electron to
package and no ffmpeg to ship. The two `node … install.js` lines run those
scripts by hand. On npm 10 or older the scripts run by themselves, and the two
lines find everything already in place.

**"Cannot create symbolic link : A required privilege is not held by the
client".** On its first Windows build, electron-builder unpacks its Windows
tools (winCodeSign). That archive holds two macOS symbolic links, and Windows
lets only an administrator, or an account with Developer Mode on, create those.
The build stops after four tries, with the app and the importers already built.
Unpack the tools yourself, without the macOS part, and package again:

```powershell
$cache = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
New-Item -ItemType Directory -Force $cache | Out-Null
Invoke-WebRequest https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z -OutFile "$cache\winCodeSign-2.6.0.7z"
& node_modules\7zip-bin\win\x64\7za.exe x -y "$cache\winCodeSign-2.6.0.7z" "-o$cache\winCodeSign-2.6.0" "-xr!darwin"
npx electron-builder --win --config electron-builder.config.cjs --publish never
```

The last line only packages, since `npm run dist:win` built everything else
before it stopped. It is needed once per machine: later builds find the tools
in the cache. 2.6.0 is the version electron-builder 25 asks for; the failed
build's log names it in its download URL. Turning on Developer Mode (Settings →
System → For developers), or building from an administrator terminal, should
also avoid the error, but neither was tried here.

#### Installing your build

1. Close every DeckWerk window.
2. Run the installer: double-click it in File Explorer, or run
   `Start-Process .\release\deckwerk-<version>-win-x64-setup.exe` in PowerShell.
3. It is unsigned, so Windows SmartScreen may stop it: choose *More info*, then
   *Run anyway*.
4. Keep the default location. DeckWerk installs for the current user into
   `%LOCALAPPDATA%\Programs\DeckWerk` and replaces an earlier install there.
   Decks are not touched.

**DeckWerk menu → Check for Updates…** looks for releases on this fork
(`kallol-saha/deckwerk`), not upstream's, so an upstream release never replaces
your build. Upstream changes come in by syncing the fork and building again.

The `slide-agent` command line runs from the checkout, not from the installed
app. Run `npm run build:export` once after `npm ci`: `slide-agent render` and
`slide-agent record` need the player bundle it builds.

## Running without packaging

To use or hack on DeckWerk without producing an installer:

```bash
npm ci
npm run dev
```

That starts the app with hot reload. `npm test` runs the suite; see
[AGENTS.md](../AGENTS.md) for architecture and testing notes.

## Signing

Local builds are unsigned, which is fine for your own machine but means macOS
Gatekeeper will refuse an unsigned `.dmg` copied to *another* Mac. The signing
configuration switches itself on only when credentials are present, so nothing
needs changing to build unsigned — see [RELEASING.md](RELEASING.md) if you want
to sign your own builds.
