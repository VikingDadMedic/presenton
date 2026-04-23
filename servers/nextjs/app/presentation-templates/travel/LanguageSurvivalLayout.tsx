import React from 'react'
import * as z from "zod";
import { IconSchema } from '../defaultSchemes';
import { RemoteSvgIcon } from '@/app/hooks/useRemoteSvgIcon';
import TravelFonts from './TravelFonts';

export const layoutId = 'travel-language-survival'
export const layoutName = 'Language Survival Kit'
export const layoutDescription = 'Essential local phrases with pronunciation guides on the left and cultural etiquette quick-reference on the right.'

const languageSurvivalSchema = z.object({
    title: z.string().min(3).max(50).default('Language Survival Kit').meta({
        description: "Main heading for the language slide",
    }),
    language_name: z.string().min(2).max(25).default('Thai').meta({
        description: "Name of the local language",
    }),
    phrases: z.array(z.object({
        english: z.string().min(2).max(40).meta({ description: "Phrase in English" }),
        local: z.string().min(2).max(40).meta({ description: "Phrase in the local language" }),
        pronunciation: z.string().min(2).max(50).meta({ description: "Phonetic pronunciation guide" }),
        icon: IconSchema.meta({ description: "Icon for this phrase category" }),
    })).min(6).max(10).default([
        { english: 'Hello', local: 'สวัสดี', pronunciation: 'sa-wat-DEE', icon: { __icon_url__: '', __icon_query__: 'hand wave' } },
        { english: 'Thank you', local: 'ขอบคุณ', pronunciation: 'kop-KOON', icon: { __icon_url__: '', __icon_query__: 'heart gratitude' } },
        { english: 'How much?', local: 'เท่าไหร่', pronunciation: 'tao-RAI', icon: { __icon_url__: '', __icon_query__: 'money coin' } },
        { english: 'Delicious!', local: 'อร่อย', pronunciation: 'a-ROY', icon: { __icon_url__: '', __icon_query__: 'food utensils' } },
        { english: 'Where is...?', local: 'อยู่ที่ไหน', pronunciation: 'yoo-tee-NAI', icon: { __icon_url__: '', __icon_query__: 'map location' } },
        { english: 'Help!', local: 'ช่วยด้วย', pronunciation: 'CHUAY-duay', icon: { __icon_url__: '', __icon_query__: 'warning alert' } },
        { english: 'Sorry', local: 'ขอโทษ', pronunciation: 'kor-TOHT', icon: { __icon_url__: '', __icon_query__: 'person bow' } },
        { english: 'Yes / No', local: 'ใช่ / ไม่', pronunciation: 'CHAI / mai', icon: { __icon_url__: '', __icon_query__: 'check cross' } },
    ]).meta({ description: "List of essential phrases" }),
    etiquette: z.array(z.object({
        tip: z.string().min(10).max(60).meta({ description: "A cultural etiquette tip" }),
        icon: IconSchema.meta({ description: "Icon for this etiquette tip" }),
    })).min(2).max(4).default([
        { tip: 'Always wai (bow with palms together) when greeting', icon: { __icon_url__: '', __icon_query__: 'hands prayer' } },
        { tip: 'Remove shoes before entering homes and temples', icon: { __icon_url__: '', __icon_query__: 'shoe footwear' } },
        { tip: 'Never point your feet at people or Buddha images', icon: { __icon_url__: '', __icon_query__: 'warning caution' } },
    ]).meta({ description: "Cultural etiquette quick-reference" }),
})

export const Schema = languageSurvivalSchema

export type LanguageSurvivalData = z.infer<typeof languageSurvivalSchema>

interface LanguageSurvivalLayoutProps {
    data?: Partial<LanguageSurvivalData>
}

const LanguageSurvivalLayout: React.FC<LanguageSurvivalLayoutProps> = ({ data: slideData }) => {
    const phrases = slideData?.phrases || []
    const etiquette = slideData?.etiquette || []

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
                            {slideData?.title || 'Language Survival Kit'}
                        </h1>
                        <span
                            className="px-3 py-1 rounded-full text-[12px] font-bold uppercase tracking-wide"
                            style={{ background: 'var(--primary-color, #2563eb)', color: 'var(--primary-text, #ffffff)' }}
                        >
                            {slideData?.language_name || 'Thai'}
                        </span>
                    </div>

                    <div className="flex flex-1 gap-6 min-h-0">
                        {/* Left — phrases grid (60%) */}
                        <div className="flex-[1.5] grid grid-cols-2 gap-2 auto-rows-min overflow-hidden content-start">
                            {phrases.map((phrase, i) => (
                                <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg" style={{ backgroundColor: 'var(--card-color, #f9fafb)' }}>
                                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: 'var(--primary-color, #2563eb)' }}>
                                        {phrase.icon?.__icon_url__ ? (
                                            <RemoteSvgIcon url={phrase.icon.__icon_url__} strokeColor="currentColor" className="w-3.5 h-3.5" color="var(--primary-text, #ffffff)" title={phrase.icon.__icon_query__ || ''} />
                                        ) : (
                                            <span className="text-[9px]" style={{ color: 'var(--primary-text, #ffffff)' }}>💬</span>
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[12px]" style={{ color: 'var(--background-text, #6b7280)' }}>{phrase.english}</p>
                                        <p className="text-[14px] font-bold" style={{ color: 'var(--primary-color, #2563eb)' }}>{phrase.local}</p>
                                        <p className="text-[11px] italic" style={{ color: 'var(--background-text, #9ca3af)', fontFamily: 'var(--body-font-family, Poppins)' }}>{phrase.pronunciation}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Right — etiquette (40%) */}
                        <div className="flex-1 flex flex-col gap-3 overflow-hidden">
                            <h3 className="text-[15px] font-semibold" style={{ color: 'var(--background-text, #111827)' }}>Etiquette</h3>
                            {etiquette.map((item, i) => (
                                <div key={i} className="flex items-start gap-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--card-color, #f9fafb)' }}>
                                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--primary-color, #2563eb)' }}>
                                        {item.icon?.__icon_url__ ? (
                                            <RemoteSvgIcon url={item.icon.__icon_url__} strokeColor="currentColor" className="w-4 h-4" color="var(--primary-text, #ffffff)" title={item.icon.__icon_query__ || ''} />
                                        ) : (
                                            <svg className="w-4 h-4" fill="var(--primary-text, #ffffff)" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
                                        )}
                                    </div>
                                    <p className="text-[13px] leading-snug" style={{ color: 'var(--background-text, #374151)', fontFamily: 'var(--body-font-family, Poppins)' }}>
                                        {item.tip}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

export default LanguageSurvivalLayout
