import React from 'react'
import * as z from "zod";
import { ImageSchema } from '../defaultSchemes';
import TravelFonts from './TravelFonts';

export const layoutId = 'travel-deal-countdown'
export const layoutName = 'Deal Countdown'
export const layoutDescription = 'An urgency-driven deal slide with a destination image on the left and deal details on the right including crossed-out original price, large sale price, savings badge, validity date, and CTA button.'

const dealCountdownSchema = z.object({
    deal_name: z.string().min(3).max(50).default('Bali Paradise Escape').meta({
        description: "Name of the travel deal or promotion",
    }),
    description: z.string().min(10).max(120).default('All-inclusive 7-night stay at a beachfront resort with daily spa, guided tours, and airport transfers included.').meta({
        description: "Brief description of what the deal includes",
    }),
    original_price: z.string().min(1).max(15).default('$2,499').meta({
        description: "Original price before discount",
    }),
    sale_price: z.string().min(1).max(15).default('$1,299').meta({
        description: "Discounted sale price",
    }),
    savings_pct: z.string().min(1).max(10).default('48% OFF').meta({
        description: "Percentage saved displayed as badge text",
    }),
    valid_until: z.string().min(3).max(25).default('Valid until Dec 31, 2025').meta({
        description: "Expiration date or validity period of the deal",
    }),
    cta: z.string().min(3).max(30).default('Book Now & Save').meta({
        description: "Call-to-action button text",
    }),
    image: ImageSchema.default({
        __image_url__: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1000&q=80',
        __image_prompt__: 'Tropical Bali beach resort with palm trees',
    }).meta({
        description: "Destination image for the deal",
    }),
})

export const Schema = dealCountdownSchema

export type DealCountdownData = z.infer<typeof dealCountdownSchema>

interface DealCountdownLayoutProps {
    data?: Partial<DealCountdownData>
}

const DealCountdownLayout: React.FC<DealCountdownLayoutProps> = ({ data: slideData }) => {
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

                <div className="relative z-10 flex h-full">
                    <div className="w-1/2 h-full relative">
                        <img
                            src={slideData?.image?.__image_url__ || ''}
                            alt={slideData?.image?.__image_prompt__ || slideData?.deal_name || ''}
                            className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/20" />
                    </div>

                    <div className="w-1/2 flex flex-col justify-center px-12 py-10">
                        <div
                            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[13px] font-bold mb-5 self-start"
                            style={{ backgroundColor: 'var(--primary-color, #ef4444)', color: 'var(--primary-text, #ffffff)' }}
                        >
                            🔥 LIMITED TIME DEAL
                        </div>

                        <h1
                            className="text-[36px] font-bold leading-tight mb-3"
                            style={{ color: 'var(--background-text, #111827)' }}
                        >
                            {slideData?.deal_name || 'Bali Paradise Escape'}
                        </h1>

                        <p
                            className="text-[14px] leading-relaxed mb-6 max-w-[420px]"
                            style={{ color: 'var(--background-text, #6b7280)', fontFamily: 'var(--body-font-family, Poppins)' }}
                        >
                            {slideData?.description || 'All-inclusive 7-night stay at a beachfront resort with daily spa, guided tours, and airport transfers included.'}
                        </p>

                        <div className="flex items-end gap-4 mb-2">
                            <span
                                className="text-[18px] line-through"
                                style={{ color: 'var(--background-text, #9ca3af)' }}
                            >
                                {slideData?.original_price || '$2,499'}
                            </span>
                            <span
                                className="text-[48px] font-extrabold leading-none"
                                style={{ color: 'var(--primary-color, #ef4444)' }}
                            >
                                {slideData?.sale_price || '$1,299'}
                            </span>
                        </div>

                        <div className="flex items-center gap-3 mb-6">
                            <span
                                className="px-3 py-1 rounded-md text-[13px] font-bold"
                                style={{ backgroundColor: 'var(--primary-color, #ef4444)', color: 'var(--primary-text, #ffffff)' }}
                            >
                                {slideData?.savings_pct || '48% OFF'}
                            </span>
                            <span
                                className="text-[13px]"
                                style={{ color: 'var(--background-text, #6b7280)', fontFamily: 'var(--body-font-family, Poppins)' }}
                            >
                                {slideData?.valid_until || 'Valid until Dec 31, 2025'}
                            </span>
                        </div>

                        <button
                            type="button"
                            className="self-start px-8 py-3.5 rounded-lg text-[16px] font-semibold transition-transform hover:scale-105"
                            style={{
                                backgroundColor: 'var(--primary-color, #2563eb)',
                                color: 'var(--primary-text, #ffffff)',
                            }}
                        >
                            {slideData?.cta || 'Book Now & Save'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    )
}

export default DealCountdownLayout
