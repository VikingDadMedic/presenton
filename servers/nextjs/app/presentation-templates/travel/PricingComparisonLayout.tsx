import React from 'react'
import * as z from "zod";
import TravelFonts from './TravelFonts';

export const layoutId = 'travel-pricing-comparison'
export const layoutName = 'Pricing Comparison'
export const layoutDescription = 'A 2–3 column pricing comparison slide for travel tiers such as economy, premium, and luxury. The middle tier is highlighted with the primary color. Each tier shows price, duration, inclusions with checkmarks, and an optional badge.'

const tierSchema = z.object({
    name: z.string().min(2).max(20).meta({
        description: "Tier name, e.g. Economy, Premium, Luxury",
    }),
    price: z.string().min(1).max(15).meta({
        description: "Displayed price, e.g. $1,299",
    }),
    currency: z.string().min(1).max(5).meta({
        description: "Currency code, e.g. USD",
    }),
    duration: z.string().min(2).max(20).meta({
        description: "Trip duration, e.g. 5 Nights / 6 Days",
    }),
    inclusions: z.array(z.string().min(3).max(60).meta({ description: "Inclusion item" })).min(2).max(5).meta({
        description: "List of what is included in this tier",
    }),
    badge: z.string().min(0).max(15).meta({
        description: "Optional badge label, e.g. Best Value, Popular",
    }),
})

const pricingComparisonSchema = z.object({
    title: z.string().min(3).max(50).default('Choose Your Perfect Trip').meta({
        description: "Main heading for the pricing section",
    }),
    description: z.string().min(5).max(100).default('Flexible packages tailored to every budget — pick the experience that suits you best.').meta({
        description: "Short description below the title",
    }),
    tiers: z.array(tierSchema).min(2).max(3).default([
        {
            name: 'Economy',
            price: '$1,299',
            currency: 'USD',
            duration: '5 Nights / 6 Days',
            inclusions: [
                'Round-trip economy flights',
                '3-star hotel accommodation',
                'Daily breakfast included',
                'Airport shuttle transfers',
            ],
            badge: '',
        },
        {
            name: 'Premium',
            price: '$2,499',
            currency: 'USD',
            duration: '7 Nights / 8 Days',
            inclusions: [
                'Round-trip business flights',
                '4-star boutique hotel stay',
                'All meals included',
                'Guided city tours & excursions',
                'Travel insurance coverage',
            ],
            badge: 'Best Value',
        },
        {
            name: 'Luxury',
            price: '$4,899',
            currency: 'USD',
            duration: '10 Nights / 11 Days',
            inclusions: [
                'First-class flights worldwide',
                '5-star resort with ocean suite',
                'Private chef & spa treatments',
                'Helicopter & yacht excursions',
                '24/7 concierge service',
            ],
            badge: '',
        },
    ]).meta({
        description: "List of pricing tiers to compare",
    }),
})

export const Schema = pricingComparisonSchema

export type PricingComparisonData = z.infer<typeof pricingComparisonSchema>

interface PricingComparisonLayoutProps {
    data?: Partial<PricingComparisonData>
}

const PricingComparisonLayout: React.FC<PricingComparisonLayoutProps> = ({ data: slideData }) => {
    const tiers = slideData?.tiers || []
    const middleIndex = Math.floor(tiers.length / 2)

    return (
        <>
            <TravelFonts />

            <div
                className="w-full rounded-sm max-w-[1280px] shadow-lg max-h-[720px] aspect-video relative z-20 mx-auto overflow-hidden"
                style={{
                    background: "var(--background-color,#ffffff)",
                    fontFamily: "var(--heading-font-family,Poppins)"
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

                {/* Main Content */}
                <div className="relative z-10 flex flex-col h-full px-8 sm:px-12 lg:px-20 pt-14 pb-8">
                    {/* Header */}
                    <div className="text-center mb-6">
                        <h1
                            className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-2"
                            style={{ color: 'var(--background-text,#111827)' }}
                        >
                            {slideData?.title || 'Choose Your Perfect Trip'}
                        </h1>
                        <p
                            className="text-sm sm:text-base max-w-[550px] mx-auto"
                            style={{ color: 'var(--background-text,#4b5563)', fontFamily: 'var(--body-font-family,Poppins)' }}
                        >
                            {slideData?.description || 'Flexible packages tailored to every budget — pick the experience that suits you best.'}
                        </p>
                    </div>

                    {/* Pricing Cards */}
                    <div className={`flex-1 grid gap-6 items-stretch ${tiers.length === 2 ? 'grid-cols-2 max-w-[700px] mx-auto w-full' : 'grid-cols-3'}`}>
                        {tiers.map((tier, index) => {
                            const isHighlighted = index === middleIndex && tiers.length > 2
                            return (
                                <div
                                    key={index}
                                    className={`rounded-xl flex flex-col overflow-hidden transition-all ${isHighlighted ? 'shadow-xl scale-[1.03] -mt-2 -mb-2' : 'shadow-md'}`}
                                    style={{
                                        background: isHighlighted ? 'var(--primary-color,#9333ea)' : 'var(--card-color,#f9fafb)',
                                        border: isHighlighted ? 'none' : '1px solid var(--stroke,#e5e7eb)',
                                    }}
                                >
                                    {/* Badge */}
                                    {tier.badge && (
                                        <div
                                            className="text-center py-1.5 text-xs font-bold uppercase tracking-wider"
                                            style={{
                                                background: isHighlighted ? 'rgba(255,255,255,0.2)' : 'var(--primary-color,#9333ea)',
                                                color: isHighlighted ? '#ffffff' : 'var(--primary-text,#ffffff)',
                                            }}
                                        >
                                            {tier.badge}
                                        </div>
                                    )}

                                    <div className="flex flex-col flex-1 p-5">
                                        {/* Tier Name */}
                                        <h3
                                            className="text-lg font-semibold mb-1"
                                            style={{ color: isHighlighted ? '#ffffff' : 'var(--background-text,#111827)' }}
                                        >
                                            {tier.name}
                                        </h3>

                                        {/* Price */}
                                        <div className="mb-1">
                                            <span
                                                className="text-3xl sm:text-4xl font-bold"
                                                style={{ color: isHighlighted ? '#ffffff' : 'var(--primary-color,#9333ea)' }}
                                            >
                                                {tier.price}
                                            </span>
                                            <span
                                                className="text-xs ml-1"
                                                style={{ color: isHighlighted ? 'rgba(255,255,255,0.7)' : 'var(--background-text,#6b7280)' }}
                                            >
                                                {tier.currency}
                                            </span>
                                        </div>

                                        {/* Duration */}
                                        <p
                                            className="text-xs font-medium mb-4 pb-3"
                                            style={{
                                                color: isHighlighted ? 'rgba(255,255,255,0.8)' : 'var(--background-text,#6b7280)',
                                                borderBottom: `1px solid ${isHighlighted ? 'rgba(255,255,255,0.2)' : 'var(--stroke,#e5e7eb)'}`,
                                                fontFamily: 'var(--body-font-family,Poppins)',
                                            }}
                                        >
                                            {tier.duration}
                                        </p>

                                        {/* Inclusions */}
                                        <ul className="space-y-2 flex-1">
                                            {tier.inclusions?.map((item, i) => (
                                                <li key={i} className="flex items-start gap-2">
                                                    <svg
                                                        className="w-4 h-4 flex-shrink-0 mt-0.5"
                                                        viewBox="0 0 20 20"
                                                        fill="currentColor"
                                                        style={{ color: isHighlighted ? '#ffffff' : 'var(--primary-color,#9333ea)' }}
                                                    >
                                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                    </svg>
                                                    <span
                                                        className="text-xs sm:text-sm"
                                                        style={{
                                                            color: isHighlighted ? 'rgba(255,255,255,0.9)' : 'var(--background-text,#374151)',
                                                            fontFamily: 'var(--body-font-family,Poppins)',
                                                        }}
                                                    >
                                                        {item}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </>
    )
}

export default PricingComparisonLayout
