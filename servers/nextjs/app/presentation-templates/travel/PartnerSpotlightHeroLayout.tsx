import React from 'react'
import * as z from "zod";
import { ImageSchema } from '../defaultSchemes';
import TravelFonts from './TravelFonts';

export const layoutId = 'travel-partner-spotlight-hero'
export const layoutName = 'Partner Spotlight Hero'
export const layoutDescription = 'A co-marketing hero slide that spotlights a travel partner with branding, value points, and destination imagery.'

const partnerSpotlightHeroSchema = z.object({
    title: z.string().min(3).max(70).default('Spotlight Partner: Azure Bay Resort').meta({
        description: "Main headline for the partner spotlight slide",
    }),
    subtitle: z.string().min(10).max(140).default('A premium beachfront stay with elevated service, family-ready amenities, and preferred booking perks.').meta({
        description: "Subheading describing the partner offer and angle",
    }),
    collaboration_note: z.string().min(5).max(60).default('In partnership with').meta({
        description: "Short collaboration label shown above partner branding",
    }),
    partner_name: z.string().min(2).max(60).default('Azure Bay Resort Collection').meta({
        description: "Partner brand name to feature",
    }),
    partner_role: z.string().min(3).max(50).default('Preferred Hotel Partner').meta({
        description: "Partner category or role in the offer",
    }),
    highlights: z.array(z.string().min(6).max(70)).min(2).max(4).default([
        'Exclusive nightly rates for our clients',
        'Complimentary breakfast and airport transfers',
        'Priority room upgrades when available',
    ]).meta({
        description: "2-4 concise partner selling points",
    }),
    image: ImageSchema.default({
        __image_url__: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1280&q=80',
        __image_prompt__: 'Luxury beachfront resort aerial view at sunset',
    }).meta({
        description: "Hero destination image for the partner spotlight",
    }),
    partner_logo: ImageSchema.default({
        __image_url__: 'https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=400&q=80',
        __image_prompt__: 'Minimal neutral brand logo mark on white background',
    }).meta({
        description: "Partner brand logo or mark",
    }),
})

export const Schema = partnerSpotlightHeroSchema

export type PartnerSpotlightHeroData = z.infer<typeof partnerSpotlightHeroSchema>

interface PartnerSpotlightHeroLayoutProps {
    data?: Partial<PartnerSpotlightHeroData>
}

const PartnerSpotlightHeroLayout: React.FC<PartnerSpotlightHeroLayoutProps> = ({ data: slideData }) => {
    const highlights = slideData?.highlights || []

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
                                {(slideData as any)?.__companyName__ && <span className="text-sm sm:text-base font-semibold" style={{ color: 'var(--primary-text, #ffffff)' }}>
                                    {(slideData as any)?.__companyName__ || 'Company Name'}
                                </span>}
                            </div>
                        </div>
                    </div>
                )}

                <div className="absolute inset-0">
                    <img
                        src={slideData?.image?.__image_url__ || ''}
                        alt={slideData?.image?.__image_prompt__ || slideData?.title || 'Partner spotlight'}
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/30" />
                </div>

                <div className="relative z-10 h-full grid grid-cols-[1.35fr_1fr] gap-8 px-10 sm:px-14 lg:px-20 py-14">
                    <div className="flex flex-col justify-center">
                        <span
                            className="inline-flex items-center px-4 py-1.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.12em] self-start"
                            style={{ background: 'var(--primary-color, #2563eb)', color: 'var(--primary-text, #ffffff)' }}
                        >
                            Partner Spotlight
                        </span>
                        <h1
                            className="text-[46px] leading-tight font-bold mt-5 max-w-[700px]"
                            style={{ color: '#ffffff' }}
                        >
                            {slideData?.title || 'Spotlight Partner: Azure Bay Resort'}
                        </h1>
                        <p
                            className="text-[18px] leading-relaxed mt-4 max-w-[660px]"
                            style={{ color: 'rgba(255,255,255,0.9)', fontFamily: 'var(--body-font-family, Poppins)' }}
                        >
                            {slideData?.subtitle || 'A premium beachfront stay with elevated service, family-ready amenities, and preferred booking perks.'}
                        </p>
                    </div>

                    <div
                        className="self-center rounded-2xl p-6 backdrop-blur-sm"
                        style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.28)' }}
                    >
                        <p
                            className="text-[11px] uppercase tracking-[0.14em] font-semibold"
                            style={{ color: 'rgba(255,255,255,0.78)' }}
                        >
                            {slideData?.collaboration_note || 'In partnership with'}
                        </p>

                        <div className="mt-3 flex items-center gap-3">
                            <div className="w-14 h-14 rounded-lg overflow-hidden bg-white flex items-center justify-center">
                                <img
                                    src={slideData?.partner_logo?.__image_url__ || ''}
                                    alt={slideData?.partner_logo?.__image_prompt__ || slideData?.partner_name || 'Partner logo'}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                            <div>
                                <p className="text-[18px] font-semibold leading-snug" style={{ color: '#ffffff' }}>
                                    {slideData?.partner_name || 'Azure Bay Resort Collection'}
                                </p>
                                <p className="text-[12px] mt-0.5" style={{ color: 'rgba(255,255,255,0.78)' }}>
                                    {slideData?.partner_role || 'Preferred Hotel Partner'}
                                </p>
                            </div>
                        </div>

                        <ul className="mt-5 space-y-2.5">
                            {highlights.map((highlight, index) => (
                                <li key={`${highlight}-${index}`} className="flex items-start gap-2.5">
                                    <span
                                        className="inline-flex w-5 h-5 rounded-full items-center justify-center text-[11px] font-bold mt-[2px] flex-shrink-0"
                                        style={{ background: 'var(--primary-color, #2563eb)', color: 'var(--primary-text, #ffffff)' }}
                                    >
                                        {index + 1}
                                    </span>
                                    <span className="text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.92)', fontFamily: 'var(--body-font-family, Poppins)' }}>
                                        {highlight}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </>
    )
}

export default PartnerSpotlightHeroLayout
