"use client"

import { useGoldPrice } from "../hooks/useGoldPrice"
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Clock, XCircle } from "lucide-react"

interface Transaction {
  id: string
  type: string
  amount: number
  status: string
  provider: string
  description: string
  createdAt: Date
}

interface StatusPillProps {
  status: string
}

function StatusPill({ status }: StatusPillProps) {
  const config = {
    Success: {
      icon: CheckCircle2,
      className: "bg-success/10 text-success border border-success/20",
    },
    Processing: {
      icon: Clock,
      className: "bg-warning/10 text-warning border border-warning/20",
    },
    Failed: {
      icon: XCircle,
      className: "bg-destructive/10 text-destructive border border-destructive/20",
    },
  }[status] || {
    icon: Clock,
    className: "bg-muted text-muted-foreground border border-border",
  }

  const Icon = config.icon

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${config.className}`}
    >
      <Icon className="h-3 w-3" />
      {status}
    </span>
  )
}

interface TransactionRowProps {
  transaction: Transaction
}

export function TransactionRow({ transaction }: TransactionRowProps) {
  const { goldPrice } = useGoldPrice()
  const currentGoldPrice = goldPrice || 12000
  const isOnramp = transaction.type === "ONRAMP"

  return (
    <tr className="group border-b border-border/50 transition-all hover:bg-accent/5 hover:shadow-sm">
      {/* Date Column */}
      <td className="px-6 py-5">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">
            {new Date(transaction.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
          <span className="text-xs text-muted-foreground">
            {new Date(transaction.createdAt).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </td>

      {/* Type Column */}
      <td className="px-6 py-5">
        <div
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 transition-all ${
            isOnramp
              ? "bg-accent/10 text-accent border border-accent/20"
              : "bg-success/10 text-success border border-success/20"
          }`}
        >
          {isOnramp ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
          <span className="text-sm font-semibold tracking-tight">{transaction.type}</span>
        </div>
      </td>

      {/* Description Column */}
      <td className="px-6 py-5">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground">{transaction.description}</span>
          <span className="text-xs text-muted-foreground">via {transaction.provider}</span>
        </div>
      </td>

      {/* Amount Column */}
      <td className="px-6 py-5">
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold text-foreground tabular-nums">
              ₹{(transaction.amount / 100).toLocaleString("en-IN")}
            </span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md bg-accent/10 px-2 py-1">
            <svg className="h-3 w-3 text-accent" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            <span className="text-xs font-semibold text-accent tabular-nums">
              {(transaction.amount / 100 / currentGoldPrice).toFixed(4)}g
            </span>
          </div>
        </div>
      </td>

      {/* Status Column */}
      <td className="px-6 py-5">
        <StatusPill status={transaction.status} />
      </td>
    </tr>
  )
}
