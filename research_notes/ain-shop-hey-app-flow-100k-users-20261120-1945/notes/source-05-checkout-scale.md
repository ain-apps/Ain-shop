# Checkout / scale — sources, read 2026-11-20
- Stripe In-App Payments: Payment Sheet recommended, 40+ methods incl Apple Pay/Google Pay/Link, PaymentIntent for immediate charge, server endpoints required, secret key never in app.
  https://docs.stripe.com/payments/mobile ; https://docs.stripe.com/payments/mobile/accept-payment?platform=react-native
- Apple Pay tokenization: Device Account Number in Secure Element, merchant never gets real card number, Face/Touch ID, no extra merchant fee; Stripe US card fee 2.9% + $0.30.
  https://comparepsp.com/payment-methods/apple-pay/ ; https://openeducat.org/integrations/stripe/
- Voice purchase safety: read back final price/tax/shipping/total + address, require explicit confirmation, spending cap, voice phrase / 2FA / purchase confirmation controls; never speak card details aloud.
  https://www.paymentsjournal.com/securing-conversational-commerce-make-interactions-virtual-assistants-safer/amp/ ; https://sider.ai/blog/ai-tools/how-to-use-chatgpt-s-instant-checkout-for-etsy-shopify-without-accidentally-buying-43-throw-pillows
- Scale math is my calculation from the sourced rates above, with assumptions stated in report.md (tokens/min, chars/min, turns/min). No vendor publishes a 100k-simultaneous price.
