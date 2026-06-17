"use client"

import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import {
  LayoutDashboard, Building2, CalendarDays, DoorOpen, Users,
  Sparkles, Wrench, Wallet, BarChart3, Globe, Settings, Bell,
  ChevronLeft, Menu, LogOut
} from "lucide-react"
import { useState } from "react"

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "properties", label: "Properties", icon: Building2 },
  { id: "reservations", label: "Reservations", icon: CalendarDays },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "rooms", label: "Rooms", icon: DoorOpen },
  { id: "guests", label: "Guests", icon: Users },
  { id: "housekeeping", label: "Housekeeping", icon: Sparkles },
  { id: "maintenance", label: "Maintenance", icon: Wrench },
  { id: "finance", label: "Finance", icon: Wallet },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "booking", label: "Booking Site", icon: Globe },
]

interface SidebarProps {
  activeView: string
  setActiveView: (view: string) => void
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
}

export function Sidebar({ activeView, setActiveView, collapsed, setCollapsed }: SidebarProps) {
  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 72 : 256 }}
      className="h-screen bg-sidebar flex flex-col fixed left-0 top-0 z-50 overflow-hidden"
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="flex items-center gap-3 px-4 h-16 border-b border-white/5 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-sm">P</span>
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 overflow-hidden"
            >
              <span className="text-white font-semibold text-sm whitespace-nowrap">Prestige PMS</span>
              <span className="text-[10px] text-gold-400 font-medium px-1.5 py-0.5 rounded-full bg-gold-500/10 border border-gold-500/20 whitespace-nowrap">LUXURY</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeView === item.id
          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={cn(
                "flex items-center gap-3 w-full rounded-lg transition-all duration-200 relative group",
                collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5",
                isActive
                  ? "bg-sidebar-active text-white"
                  : "text-zinc-400 hover:text-white hover:bg-sidebar-hover"
              )}
            >
              <Icon size={collapsed ? 20 : 18} className="shrink-0" />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    className="text-sm font-medium whitespace-nowrap overflow-hidden"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
              {isActive && (
                <motion.div
                  layoutId="activeNav"
                  className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-gradient-to-b from-gold-400 to-gold-600"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
            </button>
          )
        })}
      </nav>

      <div className="p-2 border-t border-white/5">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "flex items-center gap-3 w-full rounded-lg transition-all duration-200 text-zinc-400 hover:text-white hover:bg-sidebar-hover",
            collapsed ? "justify-center py-2.5" : "px-3 py-2.5"
          )}
        >
          <ChevronLeft size={18} className={cn("shrink-0 transition-transform duration-300", collapsed && "rotate-180")} />
        </button>
      </div>
    </motion.aside>
  )
}
