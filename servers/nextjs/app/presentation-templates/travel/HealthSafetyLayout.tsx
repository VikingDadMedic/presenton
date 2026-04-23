import React from 'react'
import * as z from "zod";
import TravelFonts from './TravelFonts';

export const layoutId = 'travel-health-safety'
export const layoutName = 'Health & Safety'
export const layoutDescription = 'A clean, scannable health and safety card showing safety rating, tap water status, vaccinations, emergency numbers, health tips, and insurance info.'

const healthSafetySchema = z.object({
    title: z.string().min(3).max(50).default('Health & Safety').meta({
        description: "Main heading for the health and safety slide",
    }),
    destination: z.string().min(2).max(30).default('Thailand').meta({
        description: "Destination country name",
    }),
    safety_rating: z.string().min(3).max(25).default('Generally Safe').meta({
        description: "Safety assessment such as Very Safe, Generally Safe, Exercise Caution",
    }),
    tap_water: z.string().min(3).max(30).default('Bottled Water Recommended').meta({
        description: "Tap water safety status",
    }),
    vaccinations: z.array(z.string().min(3).max(30).meta({
        description: "A recommended vaccination",
    })).min(2).max(5).default(['Hepatitis A', 'Typhoid', 'Tetanus', 'Japanese Encephalitis']).meta({
        description: "List of recommended vaccinations",
    }),
    emergency_numbers: z.array(z.object({
        service: z.string().min(3).max(20).meta({ description: "Emergency service name" }),
        number: z.string().min(3).max(15).meta({ description: "Emergency phone number" }),
    })).min(1).max(3).default([
        { service: 'Police', number: '191' },
        { service: 'Ambulance', number: '1669' },
        { service: 'Tourist Police', number: '1155' },
    ]).meta({ description: "Emergency contact numbers" }),
    health_tips: z.array(z.string().min(5).max(60).meta({
        description: "A practical health tip for travelers",
    })).min(2).max(4).default([
        'Pack sunscreen SPF 50+ and insect repellent',
        'Carry oral rehydration salts for heat',
        'Avoid ice from street vendors',
    ]).meta({ description: "List of practical health tips" }),
    insurance_note: z.string().min(10).max(100).default('Comprehensive travel insurance with medical evacuation coverage is strongly recommended.').meta({
        description: "Travel insurance recommendation",
    }),
})

export const Schema = healthSafetySchema

export type HealthSafetyData = z.infer<typeof healthSafetySchema>

interface HealthSafetyLayoutProps {
    data?: Partial<HealthSafetyData>
}

function getSafetyColor(rating: string): string {
    const lower = (rating || '').toLowerCase()
    if (lower.includes('very safe') || lower.includes('excellent')) return '#22c55e'
    if (lower.includes('generally') || lower.includes('good')) return '#84cc16'
    if (lower.includes('caution') || lower.includes('moderate')) return '#f59e0b'
    return '#ef4444'
}

const HealthSafetyLayout: React.FC<HealthSafetyLayoutProps> = ({ data: slideData }) => {
    const vaccinations = slideData?.vaccinations || []
    const emergencyNumbers = slideData?.emergency_numbers || []
    const healthTips = slideData?.health_tips || []
    const safetyRating = slideData?.safety_rating || 'Generally Safe'
    const safetyColor = getSafetyColor(safetyRating)

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

                <div className="relative z-10 flex flex-col h-full px-8 sm:px-12 lg:px-20 pt-14 pb-8">
                    <div className="flex items-center gap-3 mb-5">
                        <h1 className="text-[36px] font-bold leading-tight" style={{ color: 'var(--background-text, #111827)' }}>
                            {slideData?.title || 'Health & Safety'}
                        </h1>
                        <span className="text-[14px] font-semibold" style={{ color: 'var(--background-text, #6b7280)' }}>
                            {slideData?.destination || 'Thailand'}
                        </span>
                    </div>

                    <div className="flex flex-1 gap-8 min-h-0">
                        {/* Left column — wider */}
                        <div className="flex-[1.3] flex flex-col gap-4 overflow-hidden">
                            {/* Safety + Water status row */}
                            <div className="flex gap-3">
                                <div className="flex-1 p-4 rounded-lg flex items-center gap-3" style={{ backgroundColor: 'var(--card-color, #f9fafb)' }}>
                                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: safetyColor }}>
                                        <svg className="w-5 h-5" fill="#ffffff" viewBox="0 0 20 20"><path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                    </div>
                                    <div>
                                        <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--background-text, #6b7280)' }}>Safety</p>
                                        <p className="text-[15px] font-bold" style={{ color: safetyColor }}>{safetyRating}</p>
                                    </div>
                                </div>
                                <div className="flex-1 p-4 rounded-lg flex items-center gap-3" style={{ backgroundColor: 'var(--card-color, #f9fafb)' }}>
                                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--primary-color, #3b82f6)' }}>
                                        <svg className="w-5 h-5" fill="#ffffff" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" /></svg>
                                    </div>
                                    <div>
                                        <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--background-text, #6b7280)' }}>Tap Water</p>
                                        <p className="text-[14px] font-bold" style={{ color: 'var(--background-text, #111827)' }}>{slideData?.tap_water || 'Bottled Water Recommended'}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Vaccinations */}
                            <div>
                                <h3 className="text-[14px] font-semibold mb-2" style={{ color: 'var(--background-text, #111827)' }}>Recommended Vaccinations</h3>
                                <div className="flex flex-wrap gap-2">
                                    {vaccinations.map((vax, i) => (
                                        <span key={i} className="px-3 py-1.5 rounded-full text-[12px] font-semibold border" style={{ borderColor: 'var(--stroke, #e5e7eb)', color: 'var(--background-text, #374151)', backgroundColor: 'var(--card-color, #f9fafb)' }}>
                                            {vax}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Health tips */}
                            <div>
                                <h3 className="text-[14px] font-semibold mb-2" style={{ color: 'var(--background-text, #111827)' }}>Health Tips</h3>
                                <div className="flex flex-col gap-2">
                                    {healthTips.map((tip, i) => (
                                        <div key={i} className="flex items-start gap-2">
                                            <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="var(--primary-color, #2563eb)" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                            <span className="text-[12px] leading-snug" style={{ color: 'var(--background-text, #374151)', fontFamily: 'var(--body-font-family, Poppins)' }}>{tip}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Right column — narrower */}
                        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                            <div>
                                <h3 className="text-[14px] font-semibold mb-2" style={{ color: 'var(--background-text, #111827)' }}>Emergency Numbers</h3>
                                <div className="flex flex-col gap-2">
                                    {emergencyNumbers.map((em, i) => (
                                        <div key={i} className="p-4 rounded-lg flex items-center gap-3" style={{ backgroundColor: 'var(--card-color, #f9fafb)' }}>
                                            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#ef4444' }}>
                                                <svg className="w-5 h-5" fill="#ffffff" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" /></svg>
                                            </div>
                                            <div>
                                                <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--background-text, #6b7280)' }}>{em.service}</p>
                                                <p className="text-[22px] font-bold" style={{ color: 'var(--background-text, #111827)' }}>{em.number}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="p-4 rounded-lg border-l-4 mt-auto" style={{ backgroundColor: '#eff6ff', borderColor: '#3b82f6' }}>
                                <div className="flex items-start gap-2">
                                    <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="#3b82f6" viewBox="0 0 20 20"><path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001z" clipRule="evenodd" /></svg>
                                    <div>
                                        <p className="text-[12px] font-semibold mb-0.5" style={{ color: '#1e40af' }}>Travel Insurance</p>
                                        <p className="text-[12px] leading-snug" style={{ color: '#1e3a5f', fontFamily: 'var(--body-font-family, Poppins)' }}>{slideData?.insurance_note || 'Comprehensive travel insurance with medical evacuation coverage is strongly recommended.'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

export default HealthSafetyLayout
