import React from 'react'
import * as z from "zod";
import { IconSchema } from '../defaultSchemes';
import { RemoteSvgIcon } from '@/app/hooks/useRemoteSvgIcon';
import TravelFonts from './TravelFonts';

export const layoutId = 'travel-visa-entry'
export const layoutName = 'Visa & Entry Requirements'
export const layoutDescription = 'A clean informational slide showing visa type, requirements checklist, duration, cost, vaccination info, and an emergency note for traveler peace of mind.'

const visaEntrySchema = z.object({
    title: z.string().min(3).max(50).default('Entry Requirements').meta({
        description: "Main heading for the visa/entry slide",
    }),
    destination: z.string().min(2).max(30).default('Thailand').meta({
        description: "Destination country name",
    }),
    visa_type: z.string().min(3).max(30).default('Visa on Arrival').meta({
        description: "Type of visa such as Visa Free, Visa on Arrival, E-Visa Required, Visa Required",
    }),
    visa_duration: z.string().min(3).max(30).default('Up to 30 days').meta({
        description: "Maximum stay duration",
    }),
    visa_cost: z.string().min(1).max(20).default('$35 USD').meta({
        description: "Visa fee or Free",
    }),
    requirements: z.array(z.object({
        item: z.string().min(3).max(60).meta({ description: "A single entry requirement" }),
        icon: IconSchema.meta({ description: "Icon for this requirement" }),
    })).min(3).max(6).default([
        { item: 'Valid passport (6+ months remaining)', icon: { __icon_url__: '', __icon_query__: 'passport document' } },
        { item: 'Return or onward flight booking', icon: { __icon_url__: '', __icon_query__: 'airplane ticket' } },
        { item: 'Proof of accommodation', icon: { __icon_url__: '', __icon_query__: 'hotel building' } },
        { item: 'Passport-sized photo (4x6 cm)', icon: { __icon_url__: '', __icon_query__: 'camera photo' } },
    ]).meta({ description: "List of documents or requirements for entry" }),
    vaccination_info: z.string().min(10).max(120).default('COVID-19 vaccination recommended. Yellow fever certificate required if arriving from endemic countries.').meta({
        description: "Vaccination and health entry requirements",
    }),
    emergency_note: z.string().min(10).max(100).default('Register with your embassy before travel. Keep digital copies of all documents.').meta({
        description: "Important advisory note for travelers",
    }),
})

export const Schema = visaEntrySchema

export type VisaEntryData = z.infer<typeof visaEntrySchema>

interface VisaEntryLayoutProps {
    data?: Partial<VisaEntryData>
}

function getVisaColor(visaType: string): string {
    const lower = (visaType || '').toLowerCase()
    if (lower.includes('free') || lower.includes('exempt')) return '#22c55e'
    if (lower.includes('arrival') || lower.includes('e-visa')) return '#f59e0b'
    return '#ef4444'
}

const VisaEntryLayout: React.FC<VisaEntryLayoutProps> = ({ data: slideData }) => {
    const requirements = slideData?.requirements || []
    const visaType = slideData?.visa_type || 'Visa on Arrival'
    const badgeColor = getVisaColor(visaType)

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
                    {/* Header */}
                    <div className="mb-5">
                        <div className="flex items-center gap-4 mb-2">
                            <h1 className="text-[36px] font-bold leading-tight" style={{ color: 'var(--background-text, #111827)' }}>
                                {slideData?.title || 'Entry Requirements'}
                            </h1>
                            <span className="text-[14px] font-semibold" style={{ color: 'var(--background-text, #6b7280)' }}>
                                {slideData?.destination || 'Thailand'}
                            </span>
                        </div>
                        <span
                            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[13px] font-bold"
                            style={{ backgroundColor: badgeColor, color: '#ffffff' }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                            </svg>
                            {visaType}
                        </span>
                    </div>

                    {/* Two-column body */}
                    <div className="flex flex-1 gap-8 min-h-0">
                        {/* Left — requirements checklist */}
                        <div className="flex-[1.2] flex flex-col gap-3 overflow-hidden">
                            <h3 className="text-[15px] font-semibold mb-1" style={{ color: 'var(--background-text, #111827)' }}>What You Need</h3>
                            {requirements.map((req, i) => (
                                <div key={i} className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--card-color, #f9fafb)' }}>
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--primary-color, #2563eb)' }}>
                                        {req.icon?.__icon_url__ ? (
                                            <RemoteSvgIcon url={req.icon.__icon_url__} strokeColor="currentColor" className="w-4 h-4" color="var(--primary-text, #ffffff)" title={req.icon.__icon_query__ || ''} />
                                        ) : (
                                            <svg className="w-4 h-4" fill="var(--primary-text, #ffffff)" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                                        )}
                                    </div>
                                    <span className="text-[13px]" style={{ color: 'var(--background-text, #374151)', fontFamily: 'var(--body-font-family, Poppins)' }}>{req.item}</span>
                                </div>
                            ))}
                        </div>

                        {/* Right — metrics + info boxes */}
                        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-4 rounded-lg text-center" style={{ backgroundColor: 'var(--card-color, #f9fafb)' }}>
                                    <p className="text-[11px] uppercase tracking-wide font-semibold mb-1" style={{ color: 'var(--background-text, #6b7280)' }}>Duration</p>
                                    <p className="text-[20px] font-bold" style={{ color: 'var(--primary-color, #2563eb)' }}>{slideData?.visa_duration || 'Up to 30 days'}</p>
                                </div>
                                <div className="p-4 rounded-lg text-center" style={{ backgroundColor: 'var(--card-color, #f9fafb)' }}>
                                    <p className="text-[11px] uppercase tracking-wide font-semibold mb-1" style={{ color: 'var(--background-text, #6b7280)' }}>Cost</p>
                                    <p className="text-[20px] font-bold" style={{ color: 'var(--primary-color, #2563eb)' }}>{slideData?.visa_cost || '$35 USD'}</p>
                                </div>
                            </div>

                            <div className="p-4 rounded-lg border-l-4" style={{ backgroundColor: '#fef3c7', borderColor: '#f59e0b' }}>
                                <div className="flex items-start gap-2">
                                    <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="#f59e0b" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                    <div>
                                        <p className="text-[12px] font-semibold mb-0.5" style={{ color: '#92400e' }}>Vaccinations</p>
                                        <p className="text-[12px] leading-snug" style={{ color: '#78350f', fontFamily: 'var(--body-font-family, Poppins)' }}>{slideData?.vaccination_info || 'COVID-19 vaccination recommended.'}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 rounded-lg border-l-4" style={{ backgroundColor: '#eff6ff', borderColor: '#3b82f6' }}>
                                <div className="flex items-start gap-2">
                                    <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="#3b82f6" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
                                    <div>
                                        <p className="text-[12px] font-semibold mb-0.5" style={{ color: '#1e40af' }}>Travel Advisory</p>
                                        <p className="text-[12px] leading-snug" style={{ color: '#1e3a5f', fontFamily: 'var(--body-font-family, Poppins)' }}>{slideData?.emergency_note || 'Register with your embassy before travel.'}</p>
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

export default VisaEntryLayout
