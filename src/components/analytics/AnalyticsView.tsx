"use client"

import { motion } from "framer-motion"
import {
  BarChart3, TrendingUp, Download, PieChart,
  Target, Users, Globe, XCircle
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui/base"
import { analyticsData, bookings, guests } from "@/lib/data"
import { cn, formatCurrency } from "@/lib/utils"
import {
  LineChart, Line, BarChart, Bar, PieChart as RePieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, AreaChart, Area
} from "recharts"

const sourceData = [
  { name: "Airbnb", value: 35, color: "#FF5A5F" },
  { name: "Booking.com", value: 25, color: "#003580" },
  { name: "Direct", value: 20, color: "#C9A227" },
  { name: "Expedia", value: 12, color: "#191E3B" },
  { name: "VRBO", value: 8, color: "#1A5CFF" },
]

const demoData = [
  { name: "18-25", value: 12 },
  { name: "26-35", value: 35 },
  { name: "36-45", value: 30 },
  { name: "46-55", value: 15 },
  { name: "55+", value: 8 },
]

export function AnalyticsView() {
  const currentMonth = analyticsData[analyticsData.length - 1]
  const lastMonth = analyticsData[analyticsData.length - 2]
  const avgOccupancy = Math.round(analyticsData.reduce((a, b) => a + b.occupancy, 0) / analyticsData.length)
  const avgAdr = Math.round(analyticsData.reduce((a, b) => a + b.adr, 0) / analyticsData.length)
  const avgRevpar = Math.round(analyticsData.reduce((a, b) => a + b.revpar, 0) / analyticsData.length)

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white rounded-xl shadow-elevated border border-border/50 p-3 text-sm">
          <p className="font-medium text-muted mb-1">{label}</p>
          {payload.map((entry: any, i: number) => (
            <p key={i} style={{ color: entry.color }} className="font-semibold">
              {entry.name}: {entry.name === "Revenue" ? formatCurrency(entry.value) : entry.name === "ADR" || entry.name === "RevPAR" ? formatCurrency(entry.value) : `${entry.value}%`}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-tight">Analytics</h1>
          <p className="text-muted text-sm mt-1">Executive reporting and performance metrics</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-10 px-4 rounded-xl border border-border text-sm font-medium text-primary hover:bg-sand-50 transition-colors flex items-center gap-2">
            <Download size={16} />
            Export
          </button>
          <Badge variant="outline" className="text-xs">Last 12 months</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Avg Occupancy", value: `${avgOccupancy}%`, change: "+5.2% vs last year", icon: Target, color: "from-emerald-500/20 to-emerald-600/10" },
          { label: "ADR", value: formatCurrency(avgAdr), change: "+3.8% vs last year", icon: TrendingUp, color: "from-gold-400/20 to-gold-500/10" },
          { label: "RevPAR", value: formatCurrency(avgRevpar), change: "+7.1% vs last year", icon: BarChart3, color: "from-blue-500/20 to-blue-600/10" },
          { label: "Cancellation Rate", value: "4.2%", change: "-1.3% vs last year", icon: XCircle, color: "from-red-500/20 to-red-600/10" },
        ].map((stat, i) => {
          const Icon = stat.icon
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className={cn("w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center", stat.color)}>
                      <Icon size={18} className="text-primary" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-primary">{stat.value}</p>
                  <p className="text-xs text-muted">{stat.label}</p>
                  <p className="text-[10px] text-emerald-600 mt-0.5">{stat.change}</p>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analyticsData}>
                  <defs>
                    <linearGradient id="revTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#C9A227" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#C9A227" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E5EA" strokeOpacity={0.5} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#8E8E93" }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#8E8E93" }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="revenue" stroke="#C9A227" strokeWidth={2} fill="url(#revTrend)" name="Revenue" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Occupancy Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analyticsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E5EA" strokeOpacity={0.5} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#8E8E93" }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#8E8E93" }} domain={[50, 100]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="occupancy" stroke="#10B981" strokeWidth={2} dot={{ fill: "#10B981", r: 4 }} name="Occupancy" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Booking Source</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <Pie data={sourceData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={3} dataKey="value">
                    {sourceData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </RePieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 mt-2">
              {sourceData.map((s) => (
                <div key={s.name} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.name}
                  </span>
                  <span className="font-medium text-primary">{s.value}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Guest Demographics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={demoData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E5EA" strokeOpacity={0.3} horizontal={false} />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#8E8E93" }} />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#8E8E93" }} />
                  <Bar dataKey="value" fill="#C9A227" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Key Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { label: "Total Bookings", value: bookings.length.toString(), change: "+12% vs last month" },
                { label: "Total Guests", value: guests.length.toString(), change: "+8% vs last month" },
                { label: "Avg Stay Length", value: "3.4 nights", change: "+0.2 vs last month" },
                { label: "Avg Booking Value", value: formatCurrency(Math.round(bookings.reduce((a, b) => a + b.totalAmount, 0) / bookings.length)), change: "+5% vs last month" },
                { label: "Repeat Guest Rate", value: "38%", change: "+3% vs last month" },
                { label: "Revenue per Guest", value: formatCurrency(Math.round(guests.reduce((a, b) => a + b.totalSpent, 0) / guests.length)), change: "+7% vs last month" },
              ].map((metric) => (
                <div key={metric.label} className="flex items-center justify-between py-2 border-b border-border/20 last:border-0">
                  <div>
                    <p className="text-sm text-muted">{metric.label}</p>
                    <p className="text-lg font-bold text-primary">{metric.value}</p>
                  </div>
                  <span className="text-[10px] text-emerald-600">{metric.change}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
