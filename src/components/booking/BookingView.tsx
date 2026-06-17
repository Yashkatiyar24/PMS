"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import {
  Search, MapPin, CalendarDays, Users, ChevronRight,
  Star, ArrowRight, Check, Phone, Mail, Globe, MessageCircle,
  Menu, X
} from "lucide-react"
import { properties } from "@/lib/data"
import { formatCurrency } from "@/lib/utils"

export function BookingView() {
  const [mobileMenu, setMobileMenu] = useState(false)
  const featured = properties.slice(0, 6)

  return (
    <div className="min-h-screen bg-background font-sans">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-border/30">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">P</span>
            </div>
            <span className="font-semibold text-lg tracking-tight">Prestige<span className="text-gold-500">.</span></span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#" className="text-sm text-muted hover:text-primary transition-colors">Properties</a>
            <a href="#" className="text-sm text-muted hover:text-primary transition-colors">Experiences</a>
            <a href="#" className="text-sm text-muted hover:text-primary transition-colors">About</a>
            <a href="#" className="text-sm text-muted hover:text-primary transition-colors">Contact</a>
          </div>
          <div className="flex items-center gap-3">
            <button className="hidden sm:block text-sm text-muted hover:text-primary transition-colors font-medium">Sign In</button>
            <button className="h-9 px-5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors">
              Book Now
            </button>
            <button onClick={() => setMobileMenu(!mobileMenu)} className="md:hidden p-2 rounded-xl hover:bg-sand-50">
              {mobileMenu ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative h-[90vh] min-h-[600px] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/40 to-black/70 z-10" />
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1920&h=1080&fit=crop)" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30 z-10" />
        <div className="relative z-20 text-center px-6 max-w-3xl">
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-block text-gold-400 text-sm font-medium tracking-widest uppercase mb-4"
          >
            Curated Luxury Accommodations
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-5xl md:text-7xl font-bold text-white leading-tight mb-6 tracking-tight"
          >
            Where <span className="text-gradient">Luxury</span><br />
            Meets Comfort
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg text-white/80 mb-10 max-w-xl mx-auto"
          >
            Experience hand-selected residences in the world&apos;s most desirable destinations.
          </motion.p>

          {/* Search Bar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-2 max-w-2xl mx-auto"
          >
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="flex-1 flex items-center gap-2 px-4 py-2">
                <Search size={18} className="text-white/60" />
                <input type="text" placeholder="Destination or property..." className="bg-transparent text-white placeholder-white/50 text-sm w-full focus:outline-none" />
              </div>
              <div className="flex items-center gap-2 px-4 py-2 border-t sm:border-t-0 sm:border-l border-white/20">
                <CalendarDays size={18} className="text-white/60" />
                <input type="text" placeholder="Check in — Check out" className="bg-transparent text-white placeholder-white/50 text-sm w-40 focus:outline-none" />
              </div>
              <div className="flex items-center gap-2 px-4 py-2 border-t sm:border-t-0 sm:border-l border-white/20">
                <Users size={18} className="text-white/60" />
                <input type="text" placeholder="2 Guests" className="bg-transparent text-white placeholder-white/50 text-sm w-24 focus:outline-none" />
              </div>
              <button className="bg-gold-500 hover:bg-gold-600 text-white px-6 py-3 rounded-xl font-medium text-sm transition-colors whitespace-nowrap">
                Search
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Featured Properties */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-12"
        >
          <span className="text-gold-500 text-sm font-medium tracking-widest uppercase">Curated Collection</span>
          <h2 className="text-3xl md:text-4xl font-bold text-primary mt-2 tracking-tight">Featured Properties</h2>
          <p className="text-muted mt-2 max-w-xl">Handpicked residences offering unparalleled luxury and service.</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {featured.map((prop, i) => (
            <motion.div
              key={prop.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ y: -8 }}
              className="group cursor-pointer"
            >
              <div className="relative h-72 rounded-2xl overflow-hidden mb-4">
                <div className="w-full h-full bg-cover bg-center transition-transform duration-700 group-hover:scale-110" style={{ backgroundImage: `url(${prop.image})` }} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                <div className="absolute top-4 left-4">
                  <span className="inline-flex items-center gap-1 text-xs text-gold-400 bg-black/30 backdrop-blur-sm px-2.5 py-1 rounded-full border border-gold-500/30">
                    <Star size={10} className="fill-gold-400" />
                    {prop.rating}
                  </span>
                </div>
                <div className="absolute bottom-4 left-4 right-4">
                  <h3 className="text-white font-semibold text-lg">{prop.name}</h3>
                  <p className="text-white/70 text-sm flex items-center gap-1">
                    <MapPin size={12} />
                    {prop.city}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-primary">{formatCurrency(prop.revenue / 100)}<span className="text-sm text-muted font-normal">/night</span></p>
                </div>
                <button className="text-sm text-gold-600 hover:text-gold-700 font-medium flex items-center gap-1 transition-colors">
                  View Details <ArrowRight size={14} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="bg-sand-50 py-24">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="text-gold-500 text-sm font-medium tracking-widest uppercase">The Prestige Standard</span>
            <h2 className="text-3xl md:text-4xl font-bold text-primary mt-2 tracking-tight">Why Choose Prestige</h2>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { title: "Curated Excellence", desc: "Every property is hand-selected and rigorously vetted to meet our exacting standards of luxury.", icon: Star },
              { title: "Concierge Service", desc: "Dedicated concierge available 24/7 to craft personalized experiences and anticipate your needs.", icon: Phone },
              { title: "Seamless Stays", desc: "From contactless check-in to smart home technology, every detail is designed for effortless comfort.", icon: Check },
            ].map((item, i) => {
              const Icon = item.icon
              return (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="text-center p-8"
                >
                  <div className="w-14 h-14 rounded-2xl bg-white shadow-elevated flex items-center justify-center mx-auto mb-5">
                    <Icon size={24} className="text-gold-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-primary mb-2">{item.title}</h3>
                  <p className="text-muted text-sm leading-relaxed">{item.desc}</p>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary to-primary/95" />
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-10 left-10 w-72 h-72 rounded-full bg-gold-500 blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 rounded-full bg-gold-500 blur-3xl" />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-6 tracking-tight">
            Ready to Experience <span className="text-gradient">Luxury</span>?
          </h2>
          <p className="text-white/70 text-lg mb-8">Browse our collection of premium properties and book your perfect stay.</p>
          <button className="h-12 px-8 rounded-xl bg-gold-500 hover:bg-gold-600 text-white font-medium transition-colors inline-flex items-center gap-2">
            Browse All Properties <ArrowRight size={16} />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-primary py-16 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center">
                  <span className="text-white font-bold text-sm">P</span>
                </div>
                <span className="text-white font-semibold">Prestige<span className="text-gold-500">.</span></span>
              </div>
              <p className="text-zinc-400 text-sm leading-relaxed">Curated luxury accommodations in the world&apos;s most desirable destinations.</p>
            </div>
            {[
              { title: "Properties", links: ["New York", "Los Angeles", "Miami", "San Francisco"] },
              { title: "Company", links: ["About Us", "Careers", "Press", "Blog"] },
              { title: "Support", links: ["Contact", "FAQ", "Privacy", "Terms"] },
            ].map((col) => (
              <div key={col.title}>
                <h4 className="text-white text-sm font-semibold mb-4">{col.title}</h4>
                <ul className="space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link}>
                      <a href="#" className="text-zinc-400 hover:text-white text-sm transition-colors">{link}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-8 border-t border-white/5">
            <p className="text-zinc-500 text-sm">© 2026 Prestige. All rights reserved.</p>
            <div className="flex items-center gap-3">
              <a href="#" className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
                <Globe size={14} className="text-zinc-400" />
              </a>
              <a href="#" className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
                <MessageCircle size={14} className="text-zinc-400" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
