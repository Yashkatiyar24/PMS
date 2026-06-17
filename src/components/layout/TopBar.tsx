"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, Bell, ChevronDown, Settings } from "lucide-react"
import { Avatar } from "@/components/ui/base"
import { notifications } from "@/lib/data"
import { cn } from "@/lib/utils"

export function TopBar({ collapsed }: { collapsed: boolean }) {
  const [showNotifications, setShowNotifications] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <header
      className={cn(
        "h-16 bg-white/80 backdrop-blur-xl border-b border-border/50 flex items-center justify-between px-6 sticky top-0 z-40 transition-all duration-300",
        collapsed ? "ml-[72px]" : "ml-64"
      )}
    >
      <div className="flex items-center gap-4 flex-1 max-w-lg">
        <div className="relative w-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search reservations, guests, properties..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-9 pr-4 bg-sand-50/50 border border-border/50 rounded-xl text-sm 
                       placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-gold-200/50 
                       focus:border-gold-300 transition-all duration-200"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="relative p-2.5 rounded-xl hover:bg-sand-50 transition-all duration-200">
          <Bell size={18} className="text-muted" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-gold-500 text-white text-[9px] font-bold flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </button>

        <button className="relative p-2.5 rounded-xl hover:bg-sand-50 transition-all duration-200">
          <Settings size={18} className="text-muted" />
        </button>

        <button className="flex items-center gap-2.5 pl-3 pr-2 py-1.5 rounded-xl hover:bg-sand-50 transition-all duration-200">
          <Avatar src="https://api.dicebear.com/7.x/avataaars/svg?seed=Admin" alt="Admin" className="w-8 h-8" />
          <div className="text-left hidden sm:block">
            <p className="text-sm font-medium text-primary">Yash Katiyar</p>
            <p className="text-xs text-muted">Executive Manager</p>
          </div>
          <ChevronDown size={14} className="text-muted hidden sm:block" />
        </button>
      </div>

      <AnimatePresence>
        {showNotifications && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            className="absolute right-6 top-16 w-96 bg-white rounded-2xl shadow-modal border border-border/50 overflow-hidden"
          >
            <div className="p-4 border-b border-border/50">
              <h3 className="font-semibold text-sm">Notifications</h3>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "flex items-start gap-3 p-4 border-b border-border/30 hover:bg-sand-50 transition-colors cursor-pointer",
                    !n.read && "bg-sand-50/50"
                  )}
                >
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full mt-1.5 shrink-0",
                      n.priority === "high" ? "bg-red-500" : n.priority === "medium" ? "bg-amber-500" : "bg-emerald-500"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm", !n.read && "font-medium")}>{n.message}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {new Date(n.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
