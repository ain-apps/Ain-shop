# AIN Shop — ProGuard / R8 rules.
# Keep the sherpa-onnx JNI API (its native code calls these by name).
-keep class com.k2fsa.sherpa.onnx.** { *; }
# Keep the API models: Gson reads them by field name.
-keep class com.ainshop.app.data.** { *; }
-keepclassmembers class com.ainshop.app.data.** { *; }
