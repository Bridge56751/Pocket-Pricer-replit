---
name: RevenueCat in Expo Go
description: Constraints for subscription pricing and checkout when Pocket Pricer runs inside Expo Go.
---

Expo Go cannot configure the native RevenueCat SDK, load live App Store or Play Store prices, restore purchases, or complete purchases. Treat this as an unsupported runtime and show an explanatory state rather than calling the SDK.

**Why:** Calling RevenueCat offering APIs after deliberately skipping SDK configuration produces a “no singleton instance” red-screen error. Expo Go also cannot provide truthful localized store pricing as a fallback.

**How to apply:** Guard every RevenueCat operation—including offering loads, retries, purchase, restore, login/logout, and customer refresh—behind confirmed SDK availability. Test real pricing and checkout with TestFlight, an App Store/Play Store build, or a custom development build.