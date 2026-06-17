"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import {
  Wrench, AlertTriangle, Clock, User, Tag,
  MoreHorizontal, Plus
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, Badge, Avatar, StatusBadge } from "@/components/ui/base"
import { maintenanceTickets, properties } from "@/lib/data"
import { cn, formatDate } from "@/lib/utils"

export function MaintenanceView() {
  const [filter, setFilter] = useState<string>("all")

  const filtered = maintenanceTickets.filter(t => {
    if (filter === "all") return true
    return t.status === filter
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-tight">Maintenance</h1>
          <p className="text-muted text-sm mt-1">{maintenanceTickets.length} total tickets</p>
        </div>
        <button className="h-10 px-5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2">
          <Plus size={16} />
          New Ticket
        </button>
      </div>

      <div className="flex items-center gap-1.5 p-1 bg-white border border-border/50 rounded-xl">
        {["all", "open", "in-progress", "resolved", "closed"].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              filter === status ? "bg-primary text-white shadow-sm" : "text-muted hover:text-primary hover:bg-sand-50"
            )}
          >
            {status === "all" ? "All" : status === "in-progress" ? "In Progress" : status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((ticket, i) => (
          <motion.div
            key={ticket.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
          >
            <Card className="hover:shadow-elevated transition-all duration-200 group">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                    ticket.priority === "critical" ? "bg-red-50" : ticket.priority === "high" ? "bg-orange-50" : ticket.priority === "medium" ? "bg-amber-50" : "bg-gray-50"
                  )}>
                    <Wrench size={18} className={cn(
                      ticket.priority === "critical" ? "text-red-500" : ticket.priority === "high" ? "text-orange-500" : ticket.priority === "medium" ? "text-amber-500" : "text-gray-500"
                    )} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-semibold text-primary">{ticket.title}</h4>
                        <p className="text-xs text-muted mt-0.5 line-clamp-1">{ticket.description}</p>
                      </div>
                      <StatusBadge status={ticket.status} />
                    </div>
                    <div className="flex items-center gap-3 mt-3 text-xs text-muted">
                      <span className="flex items-center gap-1">
                        <Tag size={11} />
                        {ticket.category}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        Created {formatDate(ticket.createdAt)}
                      </span>
                      <span className={cn(
                        "flex items-center gap-1 px-1.5 py-0.5 rounded-full",
                        ticket.priority === "critical" ? "bg-red-50 text-red-600" : ticket.priority === "high" ? "bg-orange-50 text-orange-600" : ticket.priority === "medium" ? "bg-amber-50 text-amber-600" : "bg-gray-50 text-gray-600"
                      )}>
                        <AlertTriangle size={10} />
                        {ticket.priority}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/30">
                      <div className="flex items-center gap-2">
                        {ticket.assignedTo !== "Unassigned" && (
                          <div className="flex items-center gap-1.5">
                            <Avatar src={ticket.assignedAvatar} alt={ticket.assignedTo} className="w-6 h-6" />
                            <span className="text-xs text-primary font-medium">{ticket.assignedTo}</span>
                          </div>
                        )}
                        {ticket.assignedTo === "Unassigned" && (
                          <span className="text-xs text-muted">Unassigned</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        {ticket.estimatedCompletion && (
                          <span className="text-muted">ETA: {formatDate(ticket.estimatedCompletion)}</span>
                        )}
                        {ticket.cost > 0 && (
                          <span className="font-medium text-primary">${ticket.cost}</span>
                        )}
                        <button className="p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-sand-50">
                          <MoreHorizontal size={14} className="text-muted" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
