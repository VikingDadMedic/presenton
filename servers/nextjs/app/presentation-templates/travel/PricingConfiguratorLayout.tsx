"use client";

import React, { useMemo, useState } from 'react'
import * as z from "zod";
import { buildShowcaseConfiguratorTierChangedPayload } from '@/lib/showcase-mixpanel';
import { trackEvent, MixpanelEvent } from '@/utils/mixpanel';
import TravelFonts from './TravelFonts';

export const layoutId = 'travel-pricing-configurator'
export const layoutName = 'Pricing Configurator'
export const layoutDescription = 'An interactive pricing tool. In Showcase view the slide becomes a calculator with sliders for trip duration, party size, and tier selection that update a live total cost. In deck/print view it renders a static "starting at" tier card highlighting the Comfort option. Use this when the deck has real supply data (hotels + flights + activities) and the buyer wants to play with the numbers.'

const tierSchema = z.object({
    name: z.string().min(2).max(20).meta({
        description: "Tier label, e.g. Budget, Comfort, Luxury",
    }),
    hotel_per_night: z.number().min(0).max(5000).meta({
        description: "Per-night hotel cost in the deck currency",
    }),
    flight_cost: z.number().min(0).max(20000).meta({
        description: "Round-trip per-person flight cost in the deck currency",
    }),
    activity_per_day: z.number().min(0).max(2000).meta({
        description: "Per-person per-day activity budget in the deck currency",
    }),
    badge: z.string().min(0).max(20).meta({
        description: "Optional badge label, e.g. Recommended",
    }),
})

const pricingConfiguratorSchema = z.object({
    title: z.string().min(3).max(50).default('Customize your trip').meta({
        description: "Main heading shown above the configurator",
    }),
    description: z.string().min(5).max(140).default('Adjust the sliders to see your live total. Numbers reflect real supply data, not estimates.').meta({
        description: "Short subhead below the title",
    }),
    destination: z.string().min(2).max(50).default('Your Destination').meta({
        description: "Destination name shown in the hero label",
    }),
    tiers: z.array(tierSchema).min(2).max(3).default([
        { name: 'Budget', hotel_per_night: 120, flight_cost: 650, activity_per_day: 40, badge: '' },
        { name: 'Comfort', hotel_per_night: 280, flight_cost: 850, activity_per_day: 90, badge: 'Recommended' },
        { name: 'Luxury', hotel_per_night: 620, flight_cost: 2400, activity_per_day: 220, badge: '' },
    ]).meta({
        description: "Three tiers (Budget, Comfort, Luxury) with per-night hotel cost, per-person flight cost, and per-person per-day activity cost",
    }),
    base_party_size: z.number().int().min(1).max(8).default(2).meta({
        description: "Default party size assumed when the slide first renders",
    }),
    base_duration_days: z.number().int().min(1).max(30).default(7).meta({
        description: "Default trip duration in days assumed when the slide first renders",
    }),
    currency: z.string().min(1).max(5).default('USD').meta({
        description: "Currency code, e.g. USD",
    }),
})

export const Schema = pricingConfiguratorSchema

export type PricingConfiguratorData = z.infer<typeof pricingConfiguratorSchema>

interface PricingConfiguratorLayoutProps {
    data?: Partial<PricingConfiguratorData>
    viewMode?: "deck" | "showcase"
}

function formatCurrency(amount: number, currency: string): string {
    const rounded = Math.round(amount)
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency,
            maximumFractionDigits: 0,
        }).format(rounded)
    } catch {
        return `${currency} ${rounded.toLocaleString()}`
    }
}

function computeTotal(
    tier: PricingConfiguratorData["tiers"][number],
    days: number,
    party: number,
): number {
    return (
        tier.hotel_per_night * days +
        tier.flight_cost * party +
        tier.activity_per_day * days * party
    )
}

const PricingConfiguratorLayout: React.FC<PricingConfiguratorLayoutProps> = ({ data: slideData, viewMode = "deck" }) => {
    const tiers = (slideData?.tiers && slideData.tiers.length > 0)
        ? slideData.tiers
        : pricingConfiguratorSchema.parse({}).tiers
    const currency = slideData?.currency || 'USD'
    const baseDuration = slideData?.base_duration_days ?? 7
    const baseParty = slideData?.base_party_size ?? 2
    const destination = slideData?.destination || 'Your Destination'
    const title = slideData?.title || 'Customize your trip'
    const description = slideData?.description || 'Adjust the sliders to see your live total.'

    // Comfort tier is the canonical "starting at" reference for deck/static rendering.
    const recommendedIndex = useMemo(() => {
        const idx = tiers.findIndex((t) => /comfort/i.test(t.name))
        return idx >= 0 ? idx : Math.min(1, tiers.length - 1)
    }, [tiers])

    return (
        <>
            <TravelFonts />
            <div
                className="w-full rounded-sm max-w-[1280px] shadow-lg max-h-[720px] aspect-video relative z-20 mx-auto overflow-hidden"
                style={{
                    background: "var(--background-color,#ffffff)",
                    fontFamily: "var(--heading-font-family,Poppins)",
                }}
            >
                {(slideData as any)?.__companyName__ || (slideData as any)?._logo_url__ ? (
                    <div className="absolute top-0 left-0 right-0 px-8 sm:px-12 lg:px-20 pt-4 z-30">
                        <div className="flex items-center gap-1">
                            {(slideData as any)?._logo_url__ && (
                                <img src={(slideData as any)?._logo_url__} alt="logo" className="w-6 h-6" />
                            )}
                            {(slideData as any)?.__companyName__ && (
                                <span
                                    className="text-sm sm:text-base font-semibold"
                                    style={{ color: 'var(--background-text, #111827)' }}
                                >
                                    {(slideData as any)?.__companyName__}
                                </span>
                            )}
                        </div>
                    </div>
                ) : null}

                <div className="relative z-10 flex flex-col h-full px-8 sm:px-12 lg:px-20 pt-14 pb-8">
                    <div className="text-center mb-6">
                        <p
                            className="text-xs sm:text-sm uppercase tracking-[0.2em] mb-2"
                            style={{ color: 'var(--primary-color,#2563eb)', fontFamily: 'var(--body-font-family,Poppins)' }}
                        >
                            {destination}
                        </p>
                        <h1
                            className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-2"
                            style={{ color: 'var(--background-text,#111827)' }}
                        >
                            {title}
                        </h1>
                        <p
                            className="text-sm sm:text-base max-w-[600px] mx-auto"
                            style={{ color: 'var(--background-text,#4b5563)', fontFamily: 'var(--body-font-family,Poppins)' }}
                        >
                            {description}
                        </p>
                    </div>

                    {viewMode === "showcase" ? (
                        <PricingConfiguratorInteractive
                            tiers={tiers}
                            currency={currency}
                            baseDuration={baseDuration}
                            baseParty={baseParty}
                            recommendedIndex={recommendedIndex}
                        />
                    ) : (
                        <PricingConfiguratorStatic
                            tiers={tiers}
                            currency={currency}
                            baseDuration={baseDuration}
                            baseParty={baseParty}
                            recommendedIndex={recommendedIndex}
                        />
                    )}
                </div>
            </div>
        </>
    )
}

// Static branch: rendered for deck mode, PPTX/PDF/MP4 export, and editor preview.
// Must always render at the same default state so Puppeteer captures a stable image.
const PricingConfiguratorStatic: React.FC<{
    tiers: PricingConfiguratorData["tiers"]
    currency: string
    baseDuration: number
    baseParty: number
    recommendedIndex: number
}> = ({ tiers, currency, baseDuration, baseParty, recommendedIndex }) => {
    return (
        <div
            className={`flex-1 grid gap-5 items-stretch ${tiers.length === 2 ? 'grid-cols-2 max-w-[700px] mx-auto w-full' : 'grid-cols-3'}`}
        >
            {tiers.map((tier, index) => {
                const total = computeTotal(tier, baseDuration, baseParty)
                const isHighlighted = index === recommendedIndex
                return (
                    <div
                        key={tier.name}
                        className={`rounded-xl flex flex-col overflow-hidden transition-all ${isHighlighted ? 'shadow-xl scale-[1.03]' : 'shadow-md'}`}
                        style={{
                            background: isHighlighted ? 'var(--primary-color,#2563eb)' : 'var(--card-color,#f9fafb)',
                            border: isHighlighted ? 'none' : '1px solid var(--stroke,#e5e7eb)',
                        }}
                    >
                        {tier.badge && (
                            <div
                                className="text-center py-1.5 text-xs font-bold uppercase tracking-wider"
                                style={{
                                    background: isHighlighted ? 'rgba(255,255,255,0.2)' : 'var(--primary-color,#2563eb)',
                                    color: isHighlighted ? '#ffffff' : 'var(--primary-text,#ffffff)',
                                }}
                            >
                                {tier.badge}
                            </div>
                        )}
                        <div className="flex flex-col flex-1 p-5">
                            <h3
                                className="text-lg font-semibold mb-1"
                                style={{ color: isHighlighted ? '#ffffff' : 'var(--background-text,#111827)' }}
                            >
                                {tier.name}
                            </h3>
                            <p
                                className="text-[11px] uppercase tracking-wider mb-1"
                                style={{ color: isHighlighted ? 'rgba(255,255,255,0.7)' : 'var(--background-text,#6b7280)' }}
                            >
                                Starting at
                            </p>
                            <div className="mb-4">
                                <span
                                    className="text-3xl sm:text-4xl font-bold"
                                    style={{ color: isHighlighted ? '#ffffff' : 'var(--primary-color,#2563eb)' }}
                                >
                                    {formatCurrency(total, currency)}
                                </span>
                                <span
                                    className="text-xs ml-2"
                                    style={{ color: isHighlighted ? 'rgba(255,255,255,0.7)' : 'var(--background-text,#6b7280)' }}
                                >
                                    total
                                </span>
                            </div>
                            <p
                                className="text-xs"
                                style={{
                                    color: isHighlighted ? 'rgba(255,255,255,0.85)' : 'var(--background-text,#4b5563)',
                                    fontFamily: 'var(--body-font-family,Poppins)',
                                }}
                            >
                                {baseDuration} day{baseDuration === 1 ? '' : 's'} · {baseParty} traveler{baseParty === 1 ? '' : 's'}
                            </p>
                            <div
                                className="mt-3 pt-3 text-[11px] space-y-1"
                                style={{
                                    borderTop: `1px solid ${isHighlighted ? 'rgba(255,255,255,0.2)' : 'var(--stroke,#e5e7eb)'}`,
                                    color: isHighlighted ? 'rgba(255,255,255,0.85)' : 'var(--background-text,#4b5563)',
                                    fontFamily: 'var(--body-font-family,Poppins)',
                                }}
                            >
                                <div className="flex justify-between"><span>Hotel/night</span><span>{formatCurrency(tier.hotel_per_night, currency)}</span></div>
                                <div className="flex justify-between"><span>Flight/person</span><span>{formatCurrency(tier.flight_cost, currency)}</span></div>
                                <div className="flex justify-between"><span>Activities/day</span><span>{formatCurrency(tier.activity_per_day, currency)}</span></div>
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

// Interactive branch: rendered only in Showcase view. Local state never escapes
// the slide, so PPTX/PDF/MP4 export still capture the stable Static branch.
const PricingConfiguratorInteractive: React.FC<{
    tiers: PricingConfiguratorData["tiers"]
    currency: string
    baseDuration: number
    baseParty: number
    recommendedIndex: number
}> = ({ tiers, currency, baseDuration, baseParty, recommendedIndex }) => {
    const [tierIdx, setTierIdx] = useState(recommendedIndex)
    const [days, setDays] = useState(baseDuration)
    const [party, setParty] = useState(baseParty)

    const tier = tiers[Math.max(0, Math.min(tierIdx, tiers.length - 1))]
    const total = computeTotal(tier, days, party)
    const perPerson = party > 0 ? total / party : total

    return (
        <div className="flex-1 grid grid-cols-[1.1fr,1fr] gap-6">
            <div
                className="rounded-xl p-6 flex flex-col justify-between"
                style={{
                    background: 'var(--primary-color,#2563eb)',
                    color: '#ffffff',
                    fontFamily: 'var(--body-font-family,Poppins)',
                }}
            >
                <div>
                    <p className="text-[11px] uppercase tracking-[0.2em] opacity-80 mb-2">Your live total</p>
                    <div className="flex items-baseline gap-2">
                        <span className="text-5xl sm:text-6xl font-bold">{formatCurrency(total, currency)}</span>
                        <span className="text-sm opacity-80">total</span>
                    </div>
                    <p className="text-sm mt-2 opacity-90">{formatCurrency(perPerson, currency)} per person</p>
                </div>
                <div className="text-xs space-y-1.5 opacity-95 mt-4">
                    <div className="flex justify-between border-b border-white/20 pb-1.5">
                        <span>Hotel ({days} night{days === 1 ? '' : 's'})</span>
                        <span>{formatCurrency(tier.hotel_per_night * days, currency)}</span>
                    </div>
                    <div className="flex justify-between border-b border-white/20 pb-1.5">
                        <span>Flights ({party} traveler{party === 1 ? '' : 's'})</span>
                        <span>{formatCurrency(tier.flight_cost * party, currency)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Activities ({days} day{days === 1 ? '' : 's'} × {party})</span>
                        <span>{formatCurrency(tier.activity_per_day * days * party, currency)}</span>
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-4">
                <div>
                    <p
                        className="text-[11px] uppercase tracking-wider mb-2"
                        style={{ color: 'var(--background-text,#6b7280)', fontFamily: 'var(--body-font-family,Poppins)' }}
                    >
                        Tier
                    </p>
                    <div className="flex gap-2">
                        {tiers.map((t, i) => {
                            const active = i === tierIdx
                            return (
                                <button
                                    key={t.name}
                                    type="button"
                                    onClick={() => {
                                        if (i === tierIdx) return;
                                        const oldTier = tiers[tierIdx]?.name ?? '';
                                        setTierIdx(i);
                                        trackEvent(
                                            MixpanelEvent.Showcase_Configurator_Tier_Changed,
                                            buildShowcaseConfiguratorTierChangedPayload({
                                                layoutId,
                                                oldTier,
                                                newTier: t.name,
                                                tierCount: tiers.length,
                                            })
                                        );
                                    }}
                                    className="flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all"
                                    style={{
                                        background: active ? 'var(--primary-color,#2563eb)' : 'var(--card-color,#f9fafb)',
                                        color: active ? 'var(--primary-text,#ffffff)' : 'var(--background-text,#374151)',
                                        border: active ? 'none' : '1px solid var(--stroke,#e5e7eb)',
                                    }}
                                >
                                    {t.name}
                                </button>
                            )
                        })}
                    </div>
                </div>

                <SliderField
                    label="Duration"
                    value={days}
                    min={1}
                    max={21}
                    suffix={`${days} day${days === 1 ? '' : 's'}`}
                    onChange={setDays}
                />
                <SliderField
                    label="Party size"
                    value={party}
                    min={1}
                    max={8}
                    suffix={`${party} traveler${party === 1 ? '' : 's'}`}
                    onChange={setParty}
                />

                <p
                    className="text-[11px]"
                    style={{
                        color: 'var(--background-text,#6b7280)',
                        fontFamily: 'var(--body-font-family,Poppins)',
                    }}
                >
                    Estimates derived from real supply data (hotels, flights, activities) for this destination. Final pricing varies by date and availability.
                </p>
            </div>
        </div>
    )
}

const SliderField: React.FC<{
    label: string
    value: number
    min: number
    max: number
    suffix: string
    onChange: (v: number) => void
}> = ({ label, value, min, max, suffix, onChange }) => (
    <div>
        <div className="flex items-center justify-between mb-2">
            <p
                className="text-[11px] uppercase tracking-wider"
                style={{ color: 'var(--background-text,#6b7280)', fontFamily: 'var(--body-font-family,Poppins)' }}
            >
                {label}
            </p>
            <p
                className="text-sm font-medium"
                style={{ color: 'var(--background-text,#111827)', fontFamily: 'var(--body-font-family,Poppins)' }}
            >
                {suffix}
            </p>
        </div>
        <input
            type="range"
            min={min}
            max={max}
            value={value}
            onChange={(e) => onChange(Number.parseInt(e.target.value, 10))}
            className="w-full"
            style={{ accentColor: 'var(--primary-color,#2563eb)' }}
        />
    </div>
)

export default PricingConfiguratorLayout
