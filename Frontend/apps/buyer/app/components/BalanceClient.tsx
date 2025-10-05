"use client"
import { useGoldPrice } from "../hooks/useGoldPrice"

export const BalanceCard = ({
  amount,
  locked,
}: {
  amount: number
  locked: number
}) => {
  const { goldPrice, loading, error } = useGoldPrice()

  const totalRupees = (locked + amount) / 100
  const unlockedRupees = amount / 100
  const lockedRupees = locked / 100

  // Use dynamic gold price or fallback to default
  const currentGoldPrice = goldPrice || 12000

  const totalGold = totalRupees / currentGoldPrice
  const unlockedGold = unlockedRupees / currentGoldPrice
  const lockedGold = lockedRupees / currentGoldPrice

  return (
    <div className="relative group">
      <div className="absolute -inset-0.5 bg-gradient-to-r from-accent via-primary to-accent rounded-2xl opacity-20 group-hover:opacity-30 blur transition duration-500" />
      <div className="relative bg-card rounded-2xl border border-border/50 shadow-xl shadow-accent/5 overflow-hidden">
        <div className="relative px-6 py-5 border-b border-border/50 bg-gradient-to-r from-accent/5 via-transparent to-transparent">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-primary shadow-lg shadow-accent/20">
              <svg className="w-5 h-5 text-accent-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-card-foreground">Gold Holdings</h3>
              <p className="text-xs text-muted-foreground">Your tokenized assets</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Available Gold */}
          <div className="group/item flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-secondary/50 to-transparent border border-border/30 hover:border-accent/30 transition-all duration-300">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-accent/10 group-hover/item:bg-accent/20 transition-colors">
                <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Available Gold</div>
                <div className="text-xs text-muted-foreground/70 mt-0.5">Ready to trade</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-card-foreground">
                {unlockedGold.toFixed(4)}
                <span className="text-sm font-medium text-accent ml-1">g</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                ₹{unlockedRupees.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* Pending Gold */}
          <div className="group/item flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-secondary/30 to-transparent border border-border/30 hover:border-primary/30 transition-all duration-300">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 group-hover/item:bg-primary/20 transition-colors">
                <svg
                  className="w-4 h-4 text-primary animate-spin"
                  style={{ animationDuration: "3s" }}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pending Gold</div>
                <div className="text-xs text-muted-foreground/70 mt-0.5">Processing</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-card-foreground">
                {lockedGold.toFixed(4)}
                <span className="text-sm font-medium text-primary ml-1">g</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                ₹{lockedRupees.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* Total Holdings - Featured */}
          <div className="relative overflow-hidden p-5 rounded-xl bg-gradient-to-br from-accent/10 via-primary/5 to-transparent border-2 border-accent/20 shadow-lg shadow-accent/10">
            <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full blur-3xl" />
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-accent to-primary shadow-lg shadow-accent/30">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-semibold text-card-foreground uppercase tracking-wide">
                    Total Holdings
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">Complete portfolio value</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold bg-gradient-to-r from-accent via-primary to-accent bg-clip-text text-transparent">
                  {totalGold.toFixed(4)}
                  <span className="text-lg ml-1">g</span>
                </div>
                <div className="text-sm font-medium text-muted-foreground mt-1">
                  ₹{totalRupees.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${loading ? "bg-primary animate-pulse" : error ? "bg-destructive" : "bg-accent"}`}
              />
              <span className="text-xs font-medium text-muted-foreground">
                {loading ? "Updating price..." : error ? "Price update failed" : "Live Gold Price"}
              </span>
            </div>
            <div className="text-sm font-semibold text-card-foreground">
              ₹{currentGoldPrice.toLocaleString("en-IN")}/gram
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
