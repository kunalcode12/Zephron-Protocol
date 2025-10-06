"use client"
import { Button } from "@repo/ui/button"
import { TextInput } from "@repo/ui/textinput"
import { useState } from "react"
import { p2pTransfer } from "../lib/actions/p2pTransfer"
import { useGoldPrice } from "../hooks/useGoldPrice"
import { ArrowRight, Sparkles } from "lucide-react"

export function SendCard() {
  const [number, setNumber] = useState("")
  const [amount, setAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")

  // Use dynamic gold price
  const { goldPrice, loading: priceLoading, error: priceError } = useGoldPrice()
  const currentGoldPrice = goldPrice || 12000
  const goldEquivalent = Number(amount) / currentGoldPrice

  const handleSend = async () => {
    if (!number || !amount) {
      setMessage("Please enter both phone number and amount")
      return
    }

    setLoading(true)
    setMessage("")

    try {
      const result = await p2pTransfer(number, Number(amount) * 100)
      setMessage(result.message)

      if (result.message === "Transfer successful") {
        setNumber("")
        setAmount("")
      }
    } catch (error) {
      setMessage("Transfer failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-card via-card to-muted border border-border/50 shadow-2xl shadow-primary/5">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-accent/10 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-gradient-to-tr from-primary/10 to-transparent rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

        <div className="relative p-8 md:p-12">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-accent to-accent/80 shadow-lg shadow-accent/20">
              <Sparkles className="w-6 h-6 text-accent-foreground" />
            </div>
            <div>
              <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">Transfer Gold</h2>
              <p className="text-sm text-muted-foreground mt-1">Send tokenized gold instantly and securely</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/90 tracking-wide">Recipient Phone Number</label>
              <div className="relative">
                <TextInput
                  placeholder="Enter phone number"
                  onChange={(value) => {
                    setNumber(value)
                  }}
                  value={number}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/90 tracking-wide">Amount (₹)</label>
              <div className="relative">
                <TextInput
                  placeholder="Enter amount in rupees"
                  onChange={(value) => {
                    setAmount(value)
                  }}
                  value={amount}
                />
              </div>
            </div>

            {Number(amount) > 0 && (
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent/20 via-accent/10 to-transparent border border-accent/30 p-6 backdrop-blur-sm">
                <div className="absolute top-0 right-0 w-32 h-32 bg-accent/20 rounded-full blur-2xl" />
                <div className="relative space-y-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium text-muted-foreground tracking-wide">Gold to Transfer</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl md:text-4xl font-bold bg-gradient-to-br from-accent to-accent-foreground bg-clip-text text-transparent">
                        {goldEquivalent.toFixed(4)}
                      </span>
                      <span className="text-lg font-semibold text-accent/80">g</span>
                    </div>
                  </div>
                  <div className="h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {priceLoading
                        ? "Loading current gold price..."
                        : priceError
                          ? "Using fallback price"
                          : "Live market price"}
                    </span>
                    <span className="font-mono font-semibold text-foreground/80">
                      ₹{currentGoldPrice.toLocaleString("en-IN")}/g
                    </span>
                  </div>
                </div>
              </div>
            )}

            {message && (
              <div
                className={`rounded-2xl p-4 border backdrop-blur-sm ${
                  message.includes("successful")
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                    : "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30"
                }`}
              >
                <p className="text-sm font-medium text-center">{message}</p>
              </div>
            )}

            <Button
              onClick={handleSend}
              disabled={loading}
              className="w-full h-14 text-base font-semibold rounded-2xl bg-gradient-to-r from-accent to-accent/90 hover:from-accent/90 hover:to-accent text-accent-foreground shadow-lg shadow-accent/20 hover:shadow-xl hover:shadow-accent/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <span className="flex items-center justify-center gap-2">
                {loading ? "Processing Transfer..." : "Send Gold"}
                {!loading && (
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
                )}
              </span>
            </Button>
          </div>

          <div className="mt-8 pt-6 border-t border-border/50">
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              <span>Secured with end-to-end encryption</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
