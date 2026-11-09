## River 1.6.1

First public release of the 1.6 line (1.6.0 was not published).

River now runs on **macOS and Windows 11**, reads tables on **any site**, and has a new look in light and dark.

### Downloads

| File                               | For                                    |
| ---------------------------------- | -------------------------------------- |
| `River-1.6.1-mac-arm64.dmg`        | Macs with Apple silicon (M1 and later) |
| `River-1.6.1-mac-x64.dmg`          | Intel Macs                             |
| `River-1.6.1-windows-setup.exe`    | Windows 10 and 11 (64-bit)             |
| `River-1.6.1-chrome-extension.zip` | The Chrome table companion             |

**macOS:** open the `.dmg` and drag River to Applications. The build is not notarised, so the first time, right-click River → **Open** → **Open**.

**Windows:** run the setup. It installs for your user only (no administrator prompt). The installer is not code-signed, so Windows SmartScreen may warn: choose **More info** → **Run anyway**. Closing River's window keeps it in the notification area; quit it from the tray icon.

**Chrome extension:** unzip, open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked** and select the `browser-extension` folder. Pair it with the code from River → **Browser table → Connection**.

### What's new

- **Any site:** turn River on for a site from the extension button. It finds your cards, the board, pot, buttons and opponents' hidden hands without a map. Bet365 keeps its dedicated reader.
- **Automatic Screen reader:** for tables drawn as one image or in other apps, River finds cards by shape, reads the rank and suit, and reads the pot and buttons. Manual maps remain available. On Windows it uses the built-in Windows text recognition.
- **Better preflop decisions:** River now reads whether the pot is unopened, limped, raised or re-raised, counts only players who put chips in, and uses starting-hand ranges for each spot. AQo now raises first in and calls a raise.
- **New design:** a cleaner panel and popup, and light and dark themes across the app and extension (System, Light or Dark).
- **Windows 11 support:** native title bar, notification-area icon, single running copy, and Windows text recognition.

All analysis runs on your computer. The only network connection is between the extension and the River app on `127.0.0.1`.
