"use client"

import { motion } from "framer-motion"
import { Clock, AlertCircle, CheckCircle2, ClipboardList, Sparkles } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, Badge, Avatar, StatusBadge } from "@/components/ui/base"
import { housekeepingTasks } from "@/lib/data"
import { cn } from "@/lib/utils"

const columns = [
  { id: "pending" as const, label: "Pending", icon: Clock, color: "bg-amber-100 text-amber-700 border-amber-200", tasks: housekeepingTasks.filter(t => t.status === "pending") },
  { id: "in-progress" as const, label: "In Progress", icon: AlertCircle, color: "bg-blue-100 text-blue-700 border-blue-200", tasks: housekeepingTasks.filter(t => t.status === "in-progress") },
  { id: "completed" as const, label: "Completed", icon: CheckCircle2, color: "bg-emerald-100 text-emerald-700 border-emerald-200", tasks: housekeepingTasks.filter(t => t.status === "completed") },
  { id: "inspected" as const, label: "Inspected", icon: Sparkles, color: "bg-purple-100 text-purple-700 border-purple-200", tasks: housekeepingTasks.filter(t => t.status === "inspected") },
]

export function HousekeepingView() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-tight">Housekeeping</h1>
          <p className="text-muted text-sm mt-1">{housekeepingTasks.length} tasks scheduled</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{housekeepingTasks.filter(t => t.status === "pending").length} Pending</Badge>
          <Badge variant="outline" className="text-xs">{housekeepingTasks.filter(t => t.status === "in-progress").length} In Progress</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {columns.map((column, colIdx) => {
          const Icon = column.icon
          return (
            <div key={column.id}>
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className={cn("p-1.5 rounded-lg", column.color.split(" ")[0])}>
                  <Icon size={14} />
                </div>
                <h3 className="text-sm font-semibold text-primary">{column.label}</h3>
                <span className="text-xs text-muted bg-sand-50 px-1.5 py-0.5 rounded-full">{column.tasks.length}</span>
              </div>
              <div className="space-y-3">
                {column.tasks.map((task, i) => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: colIdx * 0.1 + i * 0.03 }}
                    layout
                  >
                    <Card className="hover:shadow-elevated transition-all duration-200">
                      <CardContent className="p-3.5">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-muted bg-sand-50 px-2 py-0.5 rounded-full border border-border/30">
                            Room {task.roomNumber}
                          </span>
                          <span className={cn(
                            "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                            task.priority === "high" ? "bg-red-50 text-red-600" : task.priority === "medium" ? "bg-amber-50 text-amber-600" : "bg-gray-50 text-gray-600"
                          )}>
                            {task.priority}
                          </span>
                        </div>
                        <p className="text-xs text-muted mb-2 truncate">{task.propertyName}</p>
                        <div className="flex items-center gap-2 mb-2">
                          <Avatar src={task.cleanerAvatar} alt={task.cleaner} className="w-6 h-6" />
                          <span className="text-xs text-primary font-medium">{task.cleaner}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted mb-2">
                          <span className="flex items-center gap-1">
                            <Clock size={10} />
                            {task.eta}
                          </span>
                        </div>
                        {task.status === "in-progress" && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-muted">Progress</span>
                              <span className="font-medium text-primary">{task.progress}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-sand-100 overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${task.progress}%` }}
                                className="h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-600"
                                transition={{ duration: 1, ease: "easeOut" }}
                              />
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
                {column.tasks.length === 0 && (
                  <div className="text-center py-8 text-sm text-muted bg-sand-50/50 rounded-xl border border-dashed border-border/50">
                    No tasks
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
