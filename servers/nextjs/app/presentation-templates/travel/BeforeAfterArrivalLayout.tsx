import React from 'react'
import * as z from "zod";
import { ImageSchema } from '../defaultSchemes';
import TravelFonts from './TravelFonts';

export const layoutId = 'travel-before-after'
export const layoutName = 'Before & After Arrival'
export const layoutDescription = 'A dramatic contrast slide showing the traveler\'s everyday reality on the left versus the destination paradise on the right, with a diagonal clip-path divider.'

const beforeAfterSchema = z.object({
    destination: z.string().min(2).max(30).default('Bali').meta({
        description: "Destination name displayed prominently on the after side",
    }),
    tagline: z.string().min(5).max(80).default('Same day. Different world.').meta({
        description: "Punchy tagline bridging the two halves",
    }),
    before_label: z.string().min(3).max(25).default('Your Monday Morning').meta({
        description: "Label for the before (everyday reality) side",
    }),
    after_label: z.string().min(3).max(25).default('Your Monday in Bali').meta({
        description: "Label for the after (destination) side",
    }),
    before_caption: z.string().min(5).max(60).default('Grey skies, crowded commute, fluorescent lights.').meta({
        description: "Short caption describing the mundane everyday scene",
    }),
    after_caption: z.string().min(5).max(60).default('Ocean breeze, fresh coconut, infinite horizon.').meta({
        description: "Short caption describing the destination experience",
    }),
    before_image: ImageSchema.default({
        __image_url__: 'https://images.unsplash.com/photo-1517732306149-e8f829eb588a?auto=format&fit=crop&w=800&q=80',
        __image_prompt__: 'Grey rainy city commute crowded train station',
    }).meta({ description: "Desaturated image of everyday mundane scene" }),
    after_image: ImageSchema.default({
        __image_url__: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=800&q=80',
        __image_prompt__: 'Tropical Bali beach crystal clear water palm trees',
    }).meta({ description: "Vibrant image of the travel destination" }),
})

export const Schema = beforeAfterSchema

export type BeforeAfterData = z.infer<typeof beforeAfterSchema>

interface BeforeAfterArrivalLayoutProps {
    data?: Partial<BeforeAfterData>
}

const BeforeAfterArrivalLayout: React.FC<BeforeAfterArrivalLayoutProps> = ({ data: slideData }) => {
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
                                {(slideData as any)?.__companyName__ && <span className="text-sm sm:text-base font-semibold" style={{ color: '#ffffff' }}>
                                    {(slideData as any)?.__companyName__ || 'Company Name'}
                                </span>}
                            </div>
                        </div>
                    </div>
                )}

                {/* Before side — full left, clipped diagonally */}
                <div className="absolute inset-0" style={{ clipPath: 'polygon(0 0, 55% 0, 45% 100%, 0 100%)' }}>
                    <img
                        src={slideData?.before_image?.__image_url__ || ''}
                        alt={slideData?.before_image?.__image_prompt__ || 'Before'}
                        className="w-full h-full object-cover"
                        style={{ filter: 'saturate(0.3) brightness(0.7)' }}
                    />
                    <div className="absolute inset-0 bg-black/40" />
                    <div className="absolute bottom-16 left-10 max-w-[380px]">
                        <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide mb-3 bg-white/20 text-white">
                            {slideData?.before_label || 'Your Monday Morning'}
                        </span>
                        <p className="text-[15px] leading-relaxed text-white/80" style={{ fontFamily: 'var(--body-font-family, Poppins)' }}>
                            {slideData?.before_caption || 'Grey skies, crowded commute, fluorescent lights.'}
                        </p>
                    </div>
                </div>

                {/* After side — full right, clipped diagonally */}
                <div className="absolute inset-0" style={{ clipPath: 'polygon(55% 0, 100% 0, 100% 100%, 45% 100%)' }}>
                    <img
                        src={slideData?.after_image?.__image_url__ || ''}
                        alt={slideData?.after_image?.__image_prompt__ || 'After'}
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/25" />
                    <div className="absolute bottom-16 right-10 max-w-[380px] text-right">
                        <span
                            className="inline-block px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide mb-3"
                            style={{ background: 'var(--primary-color, #2563eb)', color: 'var(--primary-text, #ffffff)' }}
                        >
                            {slideData?.after_label || 'Your Monday in Bali'}
                        </span>
                        <p className="text-[15px] leading-relaxed text-white/90" style={{ fontFamily: 'var(--body-font-family, Poppins)' }}>
                            {slideData?.after_caption || 'Ocean breeze, fresh coconut, infinite horizon.'}
                        </p>
                    </div>
                </div>

                {/* Center divider + tagline */}
                <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                    <div className="flex flex-col items-center">
                        <div
                            className="w-12 h-12 rounded-full flex items-center justify-center mb-3 shadow-lg"
                            style={{ background: 'var(--primary-color, #2563eb)' }}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary-text, #ffffff)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                        </div>
                        <span className="px-4 py-1.5 rounded-full text-[13px] font-semibold shadow-lg bg-white/95 backdrop-blur-sm" style={{ color: 'var(--background-text, #111827)' }}>
                            {slideData?.tagline || 'Same day. Different world.'}
                        </span>
                    </div>
                </div>

                {/* Destination name — bottom right */}
                <div className="absolute bottom-5 right-10 z-20">
                    <h1 className="text-5xl font-bold text-white drop-shadow-lg">
                        {slideData?.destination || 'Bali'}
                    </h1>
                </div>
            </div>
        </>
    )
}

export default BeforeAfterArrivalLayout
