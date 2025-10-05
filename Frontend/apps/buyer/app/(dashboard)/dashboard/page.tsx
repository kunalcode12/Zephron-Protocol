import db from "@repo/db/client"
import { getServerSession } from "next-auth"
import { authOptions } from "../../../lib/auth"
import { BalanceCard } from "../../components/BalanceClient"
import { AddMoney } from "../../components/AddMoneyCard"

async function getBalance() {
  const session = await getServerSession(authOptions)
  const userId = Number((session?.user as any)?.id)

  // Get OnRampTransaction records
  const onRampTxns = await db.onRampTransaction.findMany({
    where: {
      userId: userId,
    },
  })

  // Get P2P transfer transactions
  const p2pSent = await db.transaction.findMany({
    where: {
      fromUserId: userId,
      type: "TRANSFER",
    },
  })

  const p2pReceived = await db.transaction.findMany({
    where: {
      toUserId: userId,
      type: "TRANSFER",
    },
  })

  // Calculate balances
  const onRampTotal = onRampTxns.filter((t) => t.status === "Success").reduce((sum, t) => sum + t.amount, 0)

  const p2pSentTotal = p2pSent.reduce((sum, t) => sum + t.amount, 0)
  const p2pReceivedTotal = p2pReceived.reduce((sum, t) => sum + t.amount, 0)
  const unlockedBalance = onRampTotal - p2pSentTotal + p2pReceivedTotal

  // Calculate locked balance (Pending status)
  const lockedBalance = onRampTxns.filter((t) => t.status === "Pending").reduce((sum, t) => sum + t.amount, 0)

  return {
    amount: unlockedBalance,
    locked: lockedBalance,
  }
}

export default async function DashboardPage() {
  const balance = await getBalance()

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/5 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 backdrop-blur-sm">
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="text-xs font-medium text-accent-foreground">Live Market Data</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground to-accent bg-clip-text text-transparent">
            Gold Portfolio
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
            Manage your tokenized gold holdings, buy more gold, and track your investments in real-time.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          <div className="animate-in fade-in slide-in-from-left duration-500">
            <BalanceCard amount={balance.amount} locked={balance.locked} />
          </div>
          <div className="animate-in fade-in slide-in-from-right duration-500 delay-150">
            <AddMoney />
          </div>
        </div>
      </div>
    </div>
  )
}
