# How to build and extract the Android APK

FabriqWorld uses native modules (e.g. Bluetooth receipt printing), so you need a **development build**, not Expo Go. The `android/` folder has already been generated with `expo prebuild`. Use one of the options below to get the APK.

**Quick commands (from project root):**
- **Local:** `npm run build:apk` → APK at `android/app/build/outputs/apk/release/app-release.apk` (requires Java & Android SDK)
- **Cloud:** `npm run build:apk:eas` (requires `eas login` first)

---

## Option 1: EAS Build (recommended, no Java needed)

EAS Build runs in the cloud and produces an APK you can download.

### 1. Install EAS CLI

```bash
npm install -g eas-cli
```

### 2. Log in to Expo

```bash
eas login
```

### 3. Configure the project (first time only)

```bash
eas build:configure
```

Choose **Android** and, if asked, a build profile. You can edit `eas.json` to add an APK profile:

```json
{
  "build": {
    "preview": {
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "apk"
      }
    }
  }
}
```

`buildType: "apk"` gives you an APK file. Use `"app-bundle"` if you want an AAB for Play Store.

### 4. Start the build

```bash
npm run build:apk:eas
```

Or directly:

```bash
eas build --platform android --profile preview
```

(or use `--profile production` if you defined it)

### 5. Get the APK

- In the terminal you’ll get a link to the build page.
- When the build finishes, open the link and click **Download** to get the APK.
- Install on a device: copy the APK to the phone and open it, or use:

```bash
adb install path/to/your-app.apk
```

---

## Option 2: Local build (Gradle)

Build on your machine. **Requires:** Java (JDK 17) and the **Android SDK** (Android Studio or command-line tools).

### Install Java (fix “Unable to locate a Java Runtime”)

If you see **“The operation couldn’t be completed. Unable to locate a Java Runtime”**, install a JDK first.

**macOS (Homebrew):**

```bash
brew install openjdk@17
```

Then link it so the system finds it:

```bash
sudo ln -sfn $(brew --prefix)/opt/openjdk@17/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-17.jdk
```

Or add to your shell profile (e.g. `~/.zshrc`) and restart the terminal:

```bash
export PATH="$(brew --prefix)/opt/openjdk@17/bin:$PATH"
```

**macOS (without Homebrew):**  
Download **JDK 17** from [Adoptium](https://adoptium.net/) or [Oracle](https://www.oracle.com/java/technologies/downloads/) and run the installer. The app will usually set up Java for you.

**Check that Java is available:**

```bash
java -version
```

You should see something like `openjdk version "17.x.x"`. Then run `npm run build:apk` again.

**Don’t want to install Java?** Use **Option 1 (EAS Build)** instead: run `eas login` then `npm run build:apk:eas` and download the APK from the build page.

### Android SDK (fix “SDK location not found”)

If you see **“SDK location not found. Define a valid SDK location with ANDROID_HOME…”**:

1. **Install Android Studio** from [developer.android.com/studio](https://developer.android.com/studio). During setup it installs the Android SDK (default on macOS: `~/Library/Android/sdk`).

2. **Point the project at the SDK** using either method:

   **Option A – Environment variable** (in `~/.zshrc`):
   ```bash
   export ANDROID_HOME=$HOME/Library/Android/sdk
   export PATH=$PATH:$ANDROID_HOME/platform-tools
   ```
   Then run `source ~/.zshrc` or open a new terminal.

   **Option B – local.properties** in the project:
   - Open `android/local.properties` (create it if missing).
   - Set one line (use your actual SDK path):
   ```properties
   sdk.dir=/Users/YOUR_USERNAME/Library/Android/sdk
   ```
   Replace `YOUR_USERNAME` with your Mac username. The file is gitignored.

3. Run `npm run build:apk` again.

---

### 1. Ensure native project exists

The `android/` folder is already created. If you removed it or need to regenerate:

```bash
npm run prebuild:android
```

### 2. Build the APK

From the project root:

```bash
npm run build:apk
```

Or from the android folder:

```bash
cd android
./gradlew assembleRelease
```

On Windows use `gradlew.bat` instead of `./gradlew`.

### 3. Find the APK

After a successful build:

- **Path:** `android/app/build/outputs/apk/release/app-release.apk`
- Copy this file to your computer or phone to install.

### 4. Install on a device

- Copy `app-release.apk` to the device and open it to install, or
- With the device connected via USB and USB debugging enabled:

```bash
adb install android/app/build/outputs/apk/release/app-release.apk
```

---

## Notes

- **Signing:** For local release builds you may need to configure a keystore. EAS can manage signing for you.
- **First local build:** Ensure Android SDK and environment variables (e.g. `ANDROID_HOME`) are set. Run `./gradlew assembleRelease` from the `android/` folder.
- **Bluetooth / printing:** The app requests Bluetooth (and location for BLE scan) at runtime. Ensure the device has Bluetooth on and, for DC3M, the printer is in pairing mode when selecting it in the app.
