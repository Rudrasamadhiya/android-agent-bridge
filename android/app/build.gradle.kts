plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "io.github.rudrasamadhiya.agentbridge"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.rudrasamadhiya.agentbridge"
        minSdk = 21 // Android 5.0: phones from 2015 on
        targetSdk = 35
        versionCode = 2
        versionName = "0.1.1"
        // phones are ARM; dropping x86 builds keeps the OCR native libraries out of the APK twice
        ndk { abiFilters += listOf("armeabi-v7a", "arm64-v8a") }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Signed with the debug key so the APK installs without extra setup.
            // Use your own keystore before publishing to a store.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    // QR scanner. Without transitive deps + zxing core 3.3.0 it runs on API < 24
    // (see zxing-android-embedded README, "Older SDK versions").
    implementation("com.journeyapps:zxing-android-embedded:4.3.0") { isTransitive = false }
    implementation("com.google.zxing:core:3.3.0")
    // On-device OCR (bundled Latin model, works offline): reads text that apps hide from accessibility
    implementation("com.google.mlkit:text-recognition:16.0.1")
}
