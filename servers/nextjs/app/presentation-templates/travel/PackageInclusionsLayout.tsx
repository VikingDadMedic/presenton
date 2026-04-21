import React from 'react'
import * as z from "zod";
import { ImageSchema } from '../defaultSchemes';
import TravelFonts from './TravelFonts';

export const layoutId = 'travel-package-inclusions'
export const layoutName = 'Package Inclusions'
export const layoutDescription = 'A slide showing what is included and excluded in a travel package, with a destination image on the left and two columns of green checkmark inclusions and red X mark exclusions on the right.'

const packageInclusionsSchema = z.object({
    title: z.string().min(3).max(50).default('What\'s Included in Your Package').meta({
        description: "Main heading for the inclusions slide",
    }),
    description: z.string().min(10).max(120).default('Everything you need for an unforgettable getaway — no hidden fees, no surprises.').meta({
        description: "Brief description of the package overview",
    }),
    included: z.array(z.string().min(3).max(60).meta({
        description: "An item included in the travel package",
    })).min(3).max(8).default([
        'Round-trip flights',
        '5-star hotel accommodation',
        'Daily breakfast & dinner',
        'Airport transfers',
        'Guided city tours',
        'Travel insurance',
    ]).meta({
        description: "List of items included in the package",
    }),
    excluded: z.array(z.string().min(3).max(60).meta({
        description: "An item not included in the travel package",
    })).min(2).max(5).default([
        'Personal shopping expenses',
        'Optional adventure activities',
        'Visa processing fees',
    ]).meta({
        description: "List of items excluded from the package",
    }),
    image: ImageSchema.default({
        __image_url__: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1000&q=80',
        __image_prompt__: 'Luxury resort pool with ocean view',
    }).meta({
        description: "Image representing the travel package",
    }),
})

export const Schema = packageInclusionsSchema

export type PackageInclusionsData = z.infer<typeof packageInclusionsSchema>

interface PackageInclusionsLayoutProps {
    data?: Partial<PackageInclusionsData>
}

const PackageInclusionsLayout: React.FC<PackageInclusionsLayoutProps> = ({ data: slideData }) => {
    const included = slideData?.included || []
    const excluded = slideData?.excluded || []

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
                    <div className="mb-5">
                        <h1
                            className="text-[36px] font-bold leading-tight mb-2"
                            style={{ color: 'var(--background-text, #111827)' }}
                        >
                            {slideData?.title || "What's Included in Your Package"}
                        </h1>
                        <p
                            className="text-[14px] leading-relaxed max-w-[550px]"
                            style={{ color: 'var(--background-text, #6b7280)', fontFamily: 'var(--body-font-family, Poppins)' }}
                        >
                            {slideData?.description || 'Everything you need for an unforgettable getaway — no hidden fees, no surprises.'}
                        </p>
                    </div>

                    <div className="flex flex-1 gap-8 min-h-0">
                        <div className="w-[45%] rounded-xl overflow-hidden flex-shrink-0">
                            <img
                                src={slideData?.image?.__image_url__ || ''}
                                alt={slideData?.image?.__image_prompt__ || slideData?.title || ''}
                                className="w-full h-full object-cover"
                            />
                        </div>

                        <div className="flex-1 flex gap-6">
                            <div className="flex-1">
                                <h3
                                    className="text-[16px] font-semibold mb-4 flex items-center gap-2"
                                    style={{ color: 'var(--background-text, #111827)' }}
                                >
                                    <span
                                        className="w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-bold"
                                        style={{ backgroundColor: '#dcfce7', color: '#16a34a' }}
                                    >
                                        ✓
                                    </span>
                                    Included
                                </h3>
                                <div className="flex flex-col gap-2.5">
                                    {included.map((item, i) => (
                                        <div key={i} className="flex items-start gap-3">
                                            <span className="text-green-500 font-bold text-[14px] mt-0.5 flex-shrink-0">✓</span>
                                            <span
                                                className="text-[13px] leading-snug"
                                                style={{ color: 'var(--background-text, #374151)', fontFamily: 'var(--body-font-family, Poppins)' }}
                                            >
                                                {item}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div
                                className="w-px self-stretch"
                                style={{ backgroundColor: 'var(--stroke, #e5e7eb)' }}
                            />

                            <div className="flex-1">
                                <h3
                                    className="text-[16px] font-semibold mb-4 flex items-center gap-2"
                                    style={{ color: 'var(--background-text, #111827)' }}
                                >
                                    <span
                                        className="w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-bold"
                                        style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}
                                    >
                                        ✕
                                    </span>
                                    Excluded
                                </h3>
                                <div className="flex flex-col gap-2.5">
                                    {excluded.map((item, i) => (
                                        <div key={i} className="flex items-start gap-3">
                                            <span className="text-red-500 font-bold text-[14px] mt-0.5 flex-shrink-0">✕</span>
                                            <span
                                                className="text-[13px] leading-snug"
                                                style={{ color: 'var(--background-text, #374151)', fontFamily: 'var(--body-font-family, Poppins)' }}
                                            >
                                                {item}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

export default PackageInclusionsLayout
