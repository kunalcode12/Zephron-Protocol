"use client"

import { Button } from "@repo/ui/button"
import { Select } from "@repo/ui/select"
import { useState } from "react"
import { TextInput } from "@repo/ui/textinput"
import { loadStripe } from "@stripe/stripe-js"
import { Elements, CardElement, useElements, useStripe } from "@stripe/react-stripe-js"
import { createOnRampTransaction } from "../../lib/actions/OnRamp"
import { useGoldPrice } from "../hooks/useGoldPrice"

declare global {
  interface Window {
    Razorpay: any
  }
}

// Initialize Stripe
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY as string)

// Unified methods (providers + banks)
const METHODS = [
  { key: "razorpay", label: "Razorpay", icon: "💳" },
  { key: "stripe", label: "Stripe", icon: "💰" },
  { key: "kast", label: "KAST", redirectUrl: "https://kast.com", bankName: "KAST", icon: "🏦" },
  { key: "hdfc", label: "HDFC Bank", redirectUrl: "https://netbanking.hdfcbank.com", bankName: "HDFC Bank", icon: "🏛️" },
] as const

const PaymentForm = () => {
  const [provider, setProvider] = useState<string>(METHODS[0]?.key || "")
  const [value, setValue] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(false)
  const stripe = useStripe()
  const elements = useElements()
  const { goldPrice, loading: priceLoading, error: priceError } = useGoldPrice()

  const handleRazorpayPayment = async (amount: number) => {
    try {
      const orderResponse = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, currency: "INR" }),
      })

      const orderData = await orderResponse.json()
      console.log("Razorpay order data:", orderData)
      if (!orderData.success) {
        throw new Error("Failed to create order")
      }

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID as string,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "Your App Name",
        description: "Buy Tokenized Gold",
        order_id: orderData.order_id,
        handler: async (response: any) => {
          try {
            const verifyResponse = await fetch("/api/razorpay/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                amount: orderData.amount,
                provider: "razorpay",
              }),
            })

            const verifyData = await verifyResponse.json()

            if (verifyData.success) {
              alert("Payment successful! Gold purchased and added to your holdings.")
              setValue(0)
            } else {
              alert("Payment verification failed")
            }
          } catch (error) {
            console.error("Payment verification error:", error)
            alert("Payment verification failed")
          }
        },
        prefill: {
          name: "Ammar",
          email: "customer@example.com",
          contact: "9810977535",
        },
        theme: {
          color: "#3399cc",
        },
      }

      const rzp = new window.Razorpay(options)
      rzp.on("payment.failed", (response: any) => {
        alert("Payment failed: " + response.error.description)
      })
      rzp.open()
    } catch (error) {
      console.error("Razorpay payment error:", error)
      alert("Payment initialization failed")
    }
  }

  const handleStripePayment = async (amount: number) => {
    try {
      if (!stripe || !elements) {
        throw new Error("Stripe failed to load")
      }

      const response = await fetch("/api/stripe/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, currency: "inr" }),
      })

      const { client_secret, payment_intent_id }: { client_secret: string; payment_intent_id: string } =
        await response.json()

      if (!client_secret) {
        throw new Error("Failed to create payment intent")
      }

      const { error, paymentIntent } = await stripe.confirmCardPayment(client_secret, {
        payment_method: {
          card: elements.getElement(CardElement) as any,
        },
      })

      if (error) {
        alert("Payment failed: " + error.message)
      } else if (paymentIntent && paymentIntent.status === "succeeded") {
        const confirmResponse = await fetch("/api/stripe/confirm-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payment_intent_id: paymentIntent.id,
            amount: amount,
            provider: "stripe",
          }),
        })

        const confirmData = await confirmResponse.json()

        if (confirmData.success) {
          alert("Payment successful! Gold purchased and added to your holdings.")
          setValue(0)
        } else {
          alert("Payment confirmation failed")
        }
      }
    } catch (error) {
      console.error("Stripe payment error:", error)
      alert("Payment failed")
    }
  }

  const handleBankRedirect = async (amount: number, key: string) => {
    const bank = METHODS.find((m) => m.key === key && (m as any).redirectUrl)
    if (!bank || !("redirectUrl" in bank) || !("bankName" in bank)) {
      alert("Invalid bank selected")
      return
    }
    await createOnRampTransaction((bank as any).bankName, amount)
    window.location.href = (bank as any).redirectUrl as string
  }

  const handlePayment = async () => {
    if (value <= 0) {
      alert("Please enter a valid amount")
      return
    }

    if (!provider) {
      alert("Please select a payment provider")
      return
    }

    setLoading(true)

    try {
      if (provider === "razorpay") {
        await handleRazorpayPayment(value)
      } else if (provider === "stripe") {
        await handleStripePayment(value)
      } else if (provider === "kast" || provider === "hdfc") {
        await handleBankRedirect(value, provider)
      }
    } catch (error) {
      console.error("Payment error:", error)
      alert("Payment failed")
    } finally {
      setLoading(false)
    }
  }

  // Calculate gold equivalent using dynamic price
  const currentGoldPrice = goldPrice || 12000
  const goldEquivalent = value / currentGoldPrice

  return (
    <div className="relative group">
      <div className="absolute -inset-0.5 bg-gradient-to-r from-primary via-accent to-primary rounded-2xl opacity-20 group-hover:opacity-30 blur transition duration-500" />
      <div className="relative bg-card rounded-2xl border border-border/50 shadow-xl shadow-primary/5 overflow-hidden">
        <div className="relative px-6 py-5 border-b border-border/50 bg-gradient-to-r from-primary/5 via-transparent to-transparent">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/20">
              <svg className="w-5 h-5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-card-foreground">Buy Gold</h3>
              <p className="text-xs text-muted-foreground">Add to your portfolio</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Amount Input */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-card-foreground">Amount</label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">₹</div>
              <TextInput
                label=""
                placeholder="Enter amount in rupees"
                onChange={(val: string) => setValue(Number(val) || 0)}
              />
            </div>
          </div>

          {value > 0 && (
            <div className="relative overflow-hidden p-5 rounded-xl bg-gradient-to-br from-accent/10 via-primary/5 to-transparent border-2 border-accent/20 shadow-lg shadow-accent/10 animate-in fade-in slide-in-from-top duration-300">
              <div className="absolute top-0 right-0 w-24 h-24 bg-accent/10 rounded-full blur-2xl" />
              <div className="relative space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">You will receive</span>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/10 border border-accent/20">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    <span className="text-xs font-medium text-accent-foreground">Live Rate</span>
                  </div>
                </div>
                <div className="text-3xl font-bold bg-gradient-to-r from-accent via-primary to-accent bg-clip-text text-transparent">
                  {goldEquivalent.toFixed(4)}
                  <span className="text-lg ml-1">grams</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                    />
                  </svg>
                  {priceLoading ? (
                    <span>Loading current gold price...</span>
                  ) : priceError ? (
                    <span className="text-destructive">Using fallback price: ₹12,000/gram</span>
                  ) : (
                    <span>Current Price: ₹{currentGoldPrice.toLocaleString("en-IN")}/gram</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Payment Method */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-card-foreground">Payment Method</label>
            <Select
              onSelect={(value: string) => setProvider(value)}
              options={METHODS.map((m) => ({
                key: m.key,
                value: `${m.icon} ${m.label}`,
              }))}
            />
          </div>

          {provider === "stripe" && (
            <div className="p-4 border-2 border-border/50 rounded-xl bg-secondary/30 hover:border-primary/30 transition-colors">
              <CardElement
                options={{
                  hidePostalCode: true,
                  style: {
                    base: {
                      fontSize: "16px",
                      color: "#1a1a1a",
                      "::placeholder": {
                        color: "#9ca3af",
                      },
                    },
                  },
                }}
              />
            </div>
          )}

          <Button
            onClick={handlePayment}
            disabled={loading || value <= 0}
            className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary via-accent to-primary hover:shadow-lg hover:shadow-primary/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span>Processing...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>Buy Gold Now</span>
              </div>
            )}
          </Button>

          <div className="flex items-center justify-center gap-2 pt-2">
            <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
            <span className="text-xs text-muted-foreground">Secure payment processing</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export const AddMoney = () => {
  return (
    <>
      <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
      <Elements stripe={stripePromise}>
        <PaymentForm />
      </Elements>
    </>
  )
}
