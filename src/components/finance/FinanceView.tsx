"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import {
  Wallet, Download, ArrowUpRight, ArrowDownRight,
  TrendingUp, CreditCard, Receipt, RefreshCw
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, Badge, StatusBadge, Avatar } from "@/components/ui/base"
import { invoices, bookings, monthlyRevenue, todayRevenue } from "@/lib/data"
import { cn, formatCurrency, formatDate } from "@/lib/utils"

export function FinanceView() {
  const paidTotal = invoices.filter(i => i.status === "paid").reduce((a, b) => a + b.total, 0)
  const pendingTotal = invoices.filter(i => i.status === "pending").reduce((a, b) => a + b.total, 0)
  const refundedTotal = invoices.filter(i => i.status === "refunded").reduce((a, b) => a + b.total, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-tight">Finance</h1>
          <p className="text-muted text-sm mt-1">Billing, invoices, and revenue management</p>
        </div>
        <button className="h-10 px-5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2">
          <Download size={16} />
          Export Report
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 flex items-center justify-center">
                <TrendingUp size={18} className="text-emerald-600" />
              </div>
              <span className="flex items-center gap-0.5 text-xs font-medium text-emerald-600">
                +8.1% <ArrowUpRight size={12} />
              </span>
            </div>
            <p className="text-2xl font-bold text-primary">{formatCurrency(monthlyRevenue)}</p>
            <p className="text-xs text-muted">Monthly Revenue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 flex items-center justify-center">
                <Wallet size={18} className="text-blue-600" />
              </div>
              <span className="flex items-center gap-0.5 text-xs font-medium text-emerald-600">
                +12.3% <ArrowUpRight size={12} />
              </span>
            </div>
            <p className="text-2xl font-bold text-primary">{formatCurrency(todayRevenue)}</p>
            <p className="text-xs text-muted">Today&apos;s Revenue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 flex items-center justify-center">
                <CreditCard size={18} className="text-emerald-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-primary">{formatCurrency(paidTotal)}</p>
            <p className="text-xs text-muted">Collected Revenue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center">
                <Receipt size={18} className="text-amber-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-primary">{formatCurrency(pendingTotal)}</p>
            <p className="text-xs text-muted">Pending Payments</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Invoices</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left text-xs font-medium text-muted px-4 py-3">Invoice</th>
                <th className="text-left text-xs font-medium text-muted px-4 py-3">Guest</th>
                <th className="text-left text-xs font-medium text-muted px-4 py-3">Amount</th>
                <th className="text-left text-xs font-medium text-muted px-4 py-3">Tax</th>
                <th className="text-left text-xs font-medium text-muted px-4 py-3">Total</th>
                <th className="text-left text-xs font-medium text-muted px-4 py-3">Issued</th>
                <th className="text-left text-xs font-medium text-muted px-4 py-3">Status</th>
                <th className="text-right text-xs font-medium text-muted px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {invoices.slice(0, 10).map((inv, i) => (
                <motion.tr
                  key={inv.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.02 }}
                  className="border-b border-border/20 hover:bg-sand-50/50 transition-colors"
                >
                  <td className="px-4 py-3 text-sm font-medium text-primary">{inv.id}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-primary">{inv.guestName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-primary">{formatCurrency(inv.amount)}</td>
                  <td className="px-4 py-3 text-sm text-muted">{formatCurrency(inv.tax)}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-primary">{formatCurrency(inv.total)}</td>
                  <td className="px-4 py-3 text-sm text-muted">{formatDate(inv.issuedDate)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button className="p-1.5 rounded-lg hover:bg-sand-50 transition-colors">
                      <Download size={14} className="text-muted" />
                    </button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
