import React from 'react'
import * as z from "zod";
import TravelFonts from './TravelFonts';

export const layoutId = 'travel-connectivity'
export const layoutName = 'Connectivity'
export const layoutDescription = 'A practical connectivity card showing WiFi quality, SIM card options with prices, power outlet info, and digital nomad tips.'

const connectivitySchema = z.object({
    title: z.string().min(3).max(50).default('Staying Connected').meta({
        description: "Main heading for the connectivity slide",
    }),
    destination: z.string().min(2).max(30).default('Bali').meta({
        description: "Destination name",
    }),
    wifi_rating: z.string().min(3).max(25).default('Good').meta({
        description: "WiFi quality rating such as Excellent, Good, Limited",
    }),
    sim_options: z.array(z.object({
        provider: z.string().min(2).max(25).meta({ description: "Mobile provider or SIM card name" }),
        data: z.string().min(3).max(20).meta({ description: "Data allowance and validity" }),
        price: z.string().min(1).max(15).meta({ description: "Price of the SIM package" }),
    })).min(1).max(3).default([
        { provider: 'Telkomsel Tourist', data: '25GB / 30 days', price: '$8' },
        { provider: 'XL Priority', data: '15GB / 14 days', price: '$5' },
        { provider: 'Indosat eSIM', data: '10GB / 7 days', price: '$4' },
    ]).meta({ description: "Available SIM card options" }),
    power_info: z.object({
        outlet_type: z.string().min(2).max(15).default('Type C, F').meta({ description: "Power outlet type codes" }),
        voltage: z.string().min(3).max(15).default('230V / 50Hz').meta({ description: "Voltage and frequency" }),
    }).meta({ description: "Power outlet and voltage information" }),
    nomad_tips: z.array(z.string().min(5).max(60).meta({
        description: "A practical digital nomad or connectivity tip",
    })).min(2).max(4).default([
        'Coworking spaces from $5/day in Canggu',
        'Most cafes offer free WiFi averaging 15-30 Mbps',
        'Download offline maps before arriving',
    ]).meta({ description: "Tips for staying productive while traveling" }),
})

export const Schema = connectivitySchema

export type ConnectivityData = z.infer<typeof connectivitySchema>

interface ConnectivityCardLayoutProps {
    data?: Partial<ConnectivityData>
}

function getWifiIcon(rating: string): { bars: number; color: string } {
    const lower = (rating || '').toLowerCase()
    if (lower.includes('excellent') || lower.includes('fast')) return { bars: 4, color: '#22c55e' }
    if (lower.includes('good')) return { bars: 3, color: '#84cc16' }
    if (lower.includes('moderate')) return { bars: 2, color: '#f59e0b' }
    return { bars: 1, color: '#ef4444' }
}

const ConnectivityCardLayout: React.FC<ConnectivityCardLayoutProps> = ({ data: slideData }) => {
    const simOptions = slideData?.sim_options || []
    const nomadTips = slideData?.nomad_tips || []
    const wifiRating = slideData?.wifi_rating || 'Good'
    const wifi = getWifiIcon(wifiRating)

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
                {((slideData as any)?.__companyName__ || (slideData as any)?._logo_url__) && (
                    <div className="absolute top-0 left-0 right-0 px-8 sm:px-12 lg:px-20 pt-4 z-30">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1">
                                {(slideData as any)?._logo_url__ && <img src={(slideData as any)?._logo_url__} alt="logo" className="w-6 h-6" />}
                                {(slideData as any)?.__companyName__ && <span className="text-sm sm:text-base font-semibold" style={{ color: 'var(--background-text, #111827)' }}>
                                    {(slideData as any)?.__companyName__ || 'Company Name'}
                                </span>}
                            </div>
                        </div>
                    </div>
                )}

                <div className="relative z-10 flex flex-col h-full px-8 sm:px-12 lg:px-16 pt-14 pb-6">
                    <div className="flex items-center gap-3 mb-5">
                        <h1 className="text-[36px] font-bold leading-tight" style={{ color: 'var(--background-text, #111827)' }}>
                            {slideData?.title || 'Staying Connected'}
                        </h1>
                        <span className="text-[14px] font-semibold" style={{ color: 'var(--background-text, #6b7280)' }}>
                            {slideData?.destination || 'Bali'}
                        </span>
                    </div>

                    <div className="grid grid-cols-3 gap-5 flex-1 min-h-0">
                        {/* Column 1 — WiFi + SIM */}
                        <div className="flex flex-col gap-4">
                            <div className="p-5 rounded-xl border text-center" style={{ borderColor: 'var(--stroke, #e5e7eb)', backgroundColor: 'var(--card-color, #ffffff)' }}>
                                {/* WiFi signal icon */}
                                <div className="flex justify-center mb-2">
                                    <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none">
                                        {[18, 14, 10, 6].map((r, i) => (
                                            <path key={i} d={`M${12 - r / 2} ${18 - (3 - i) * 3} a${r} ${r} 0 0 1 ${r} 0`} stroke={i < wifi.bars ? wifi.color : 'var(--stroke, #d1d5db)'} strokeWidth="2" strokeLinecap="round" fill="none" />
                                        ))}
                                        <circle cx="12" cy="19" r="1.5" fill={wifi.color} />
                                    </svg>
                                </div>
                                <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--background-text, #6b7280)' }}>WiFi Quality</p>
                                <p className="text-[18px] font-bold" style={{ color: wifi.color }}>{wifiRating}</p>
                            </div>

                            <div>
                                <h3 className="text-[13px] font-semibold mb-2" style={{ color: 'var(--background-text, #111827)' }}>SIM Card Options</h3>
                                <div className="flex flex-col gap-2">
                                    {simOptions.map((sim, i) => (
                                        <div key={i} className="p-3 rounded-lg border" style={{ borderColor: 'var(--stroke, #e5e7eb)', backgroundColor: 'var(--card-color, #ffffff)' }}>
                                            <p className="text-[13px] font-semibold" style={{ color: 'var(--background-text, #111827)' }}>{sim.provider}</p>
                                            <div className="flex items-center justify-between mt-1">
                                                <span className="text-[11px]" style={{ color: 'var(--background-text, #6b7280)' }}>{sim.data}</span>
                                                <span className="text-[13px] font-bold" style={{ color: 'var(--primary-color, #2563eb)' }}>{sim.price}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Column 2 — Power info */}
                        <div className="flex flex-col gap-4">
                            <div className="p-5 rounded-xl border text-center flex-1 flex flex-col items-center justify-center" style={{ borderColor: 'var(--stroke, #e5e7eb)', backgroundColor: 'var(--card-color, #ffffff)' }}>
                                <svg className="w-16 h-16 mb-3" fill="var(--primary-color, #2563eb)" viewBox="0 0 24 24">
                                    <path d="M7 2v11h3v9l7-12h-4l4-8z" />
                                </svg>
                                <p className="text-[11px] uppercase tracking-wide font-semibold mb-1" style={{ color: 'var(--background-text, #6b7280)' }}>Outlet Type</p>
                                <p className="text-[22px] font-bold mb-3" style={{ color: 'var(--background-text, #111827)' }}>{slideData?.power_info?.outlet_type || 'Type C, F'}</p>
                                <p className="text-[11px] uppercase tracking-wide font-semibold mb-1" style={{ color: 'var(--background-text, #6b7280)' }}>Voltage</p>
                                <p className="text-[18px] font-bold" style={{ color: 'var(--primary-color, #2563eb)' }}>{slideData?.power_info?.voltage || '230V / 50Hz'}</p>
                            </div>
                        </div>

                        {/* Column 3 — Nomad tips */}
                        <div className="flex flex-col gap-3">
                            <h3 className="text-[13px] font-semibold" style={{ color: 'var(--background-text, #111827)' }}>Digital Nomad Tips</h3>
                            {nomadTips.map((tip, i) => (
                                <div key={i} className="flex items-start gap-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--card-color, #f9fafb)' }}>
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--primary-color, #2563eb)' }}>
                                        <svg className="w-4 h-4" fill="var(--primary-text, #ffffff)" viewBox="0 0 24 24">
                                            <path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z" />
                                        </svg>
                                    </div>
                                    <p className="text-[13px] leading-snug" style={{ color: 'var(--background-text, #374151)', fontFamily: 'var(--body-font-family, Poppins)' }}>{tip}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

export default ConnectivityCardLayout
