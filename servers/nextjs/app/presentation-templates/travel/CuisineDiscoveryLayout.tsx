import React from 'react'
import * as z from "zod";
import { ImageSchema } from '../defaultSchemes';
import TravelFonts from './TravelFonts';

export const layoutId = 'travel-cuisine-discovery'
export const layoutName = 'Cuisine Discovery'
export const layoutDescription = 'A food-forward grid of local dish cards with photos, local names, price ranges, and spice-level indicators. Food sells travel.'

const cuisineSchema = z.object({
    title: z.string().min(3).max(50).default('Taste of Thailand').meta({
        description: "Main heading for the cuisine discovery slide",
    }),
    description: z.string().min(10).max(120).default('From sizzling street woks to elegant riverside dining, every bite tells the story of this vibrant culture.').meta({
        description: "Brief intro to the local food scene",
    }),
    dishes: z.array(z.object({
        name: z.string().min(2).max(30).meta({ description: "Dish name in English" }),
        local_name: z.string().min(2).max(30).meta({ description: "Dish name in the local language" }),
        description: z.string().min(10).max(80).meta({ description: "Brief description of the dish" }),
        price_range: z.string().min(1).max(15).meta({ description: "Typical price range such as $5-12" }),
        spice_level: z.number().min(0).max(5).meta({ description: "Spice level from 0 (mild) to 5 (extreme)" }),
        image: ImageSchema.meta({ description: "Appetising photo of the dish" }),
    })).min(3).max(6).default([
        {
            name: 'Pad Thai', local_name: 'ผัดไทย',
            description: 'Stir-fried rice noodles with shrimp, peanuts, bean sprouts, and tamarind sauce.',
            price_range: '$2-5', spice_level: 2,
            image: { __image_url__: 'https://images.unsplash.com/photo-1559314809-0d155014e29e?auto=format&fit=crop&w=600&q=80', __image_prompt__: 'Pad Thai noodles street food plate' },
        },
        {
            name: 'Green Curry', local_name: 'แกงเขียวหวาน',
            description: 'Creamy coconut curry with Thai basil, bamboo shoots, and your choice of protein.',
            price_range: '$3-8', spice_level: 4,
            image: { __image_url__: 'https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?auto=format&fit=crop&w=600&q=80', __image_prompt__: 'Thai green curry coconut bowl' },
        },
        {
            name: 'Mango Sticky Rice', local_name: 'ข้าวเหนียวมะม่วง',
            description: 'Sweet glutinous rice with ripe mango and drizzled coconut cream.',
            price_range: '$1-3', spice_level: 0,
            image: { __image_url__: 'https://images.unsplash.com/photo-1536510344784-05aaad4b3c35?auto=format&fit=crop&w=600&q=80', __image_prompt__: 'Mango sticky rice Thai dessert' },
        },
        {
            name: 'Tom Yum Goong', local_name: 'ต้มยำกุ้ง',
            description: 'Hot and sour soup with prawns, lemongrass, galangal, and lime leaves.',
            price_range: '$3-7', spice_level: 4,
            image: { __image_url__: 'https://images.unsplash.com/photo-1548943487-a2e4e43b4853?auto=format&fit=crop&w=600&q=80', __image_prompt__: 'Tom yum soup prawns Thai' },
        },
        {
            name: 'Som Tum', local_name: 'ส้มตำ',
            description: 'Spicy green papaya salad with peanuts, dried shrimp, and chilli.',
            price_range: '$1-4', spice_level: 5,
            image: { __image_url__: 'https://images.unsplash.com/photo-1562565652-a0d8f0c59eb4?auto=format&fit=crop&w=600&q=80', __image_prompt__: 'Som tum papaya salad Thai' },
        },
        {
            name: 'Khao Soi', local_name: 'ข้าวซอย',
            description: 'Northern-style coconut curry noodle soup with crispy egg noodle topping.',
            price_range: '$2-5', spice_level: 3,
            image: { __image_url__: 'https://images.unsplash.com/photo-1569562211093-4ed0d0758f12?auto=format&fit=crop&w=600&q=80', __image_prompt__: 'Khao soi curry noodles Chiang Mai' },
        },
    ]).meta({ description: "List of local dishes to showcase" }),
})

export const Schema = cuisineSchema

export type CuisineData = z.infer<typeof cuisineSchema>

interface CuisineDiscoveryLayoutProps {
    data?: Partial<CuisineData>
}

const SpiceIndicator: React.FC<{ level: number }> = ({ level }) => (
    <div className="flex gap-0.5">
        {Array.from({ length: 5 }, (_, i) => (
            <svg key={i} className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={i < level ? 'var(--primary-color, #ef4444)' : 'var(--stroke, #d1d5db)'}>
                <path d="M12 2C8 2 4 6 4 10c0 5.5 8 12 8 12s8-6.5 8-12c0-4-4-8-8-8zm0 3c1.5 0 3 1.2 3 3s-1.5 3-3 3-3-1.2-3-3 1.5-3 3-3z" />
            </svg>
        ))}
    </div>
)

const CuisineDiscoveryLayout: React.FC<CuisineDiscoveryLayoutProps> = ({ data: slideData }) => {
    const dishes = slideData?.dishes || []
    const cols = dishes.length <= 3 ? 'grid-cols-3' : 'grid-cols-3'

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
                    <div className="mb-4">
                        <h1 className="text-[36px] font-bold leading-tight mb-1" style={{ color: 'var(--background-text, #111827)' }}>
                            {slideData?.title || 'Taste of Thailand'}
                        </h1>
                        <p className="text-[14px] leading-relaxed max-w-[600px]" style={{ color: 'var(--background-text, #6b7280)', fontFamily: 'var(--body-font-family, Poppins)' }}>
                            {slideData?.description || 'From sizzling street woks to elegant riverside dining, every bite tells the story of this vibrant culture.'}
                        </p>
                    </div>

                    <div className={`grid ${cols} gap-4 flex-1 min-h-0`}>
                        {dishes.map((dish, index) => (
                            <div
                                key={index}
                                className="rounded-xl overflow-hidden border flex flex-col"
                                style={{ borderColor: 'var(--stroke, #e5e7eb)', backgroundColor: 'var(--card-color, #ffffff)' }}
                            >
                                <div className="relative h-[140px] flex-shrink-0">
                                    <img
                                        src={dish.image?.__image_url__ || ''}
                                        alt={dish.image?.__image_prompt__ || dish.name || ''}
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                                <div className="flex flex-col flex-1 p-3">
                                    <h3 className="text-[14px] font-bold leading-tight" style={{ color: 'var(--background-text, #111827)' }}>
                                        {dish.name}
                                    </h3>
                                    <p className="text-[11px] italic mt-0.5" style={{ color: 'var(--primary-color, #2563eb)' }}>
                                        {dish.local_name}
                                    </p>
                                    <p className="text-[11px] leading-snug mt-1 flex-1 line-clamp-2" style={{ color: 'var(--background-text, #6b7280)', fontFamily: 'var(--body-font-family, Poppins)' }}>
                                        {dish.description}
                                    </p>
                                    <div className="flex items-center justify-between mt-2 pt-2 border-t" style={{ borderColor: 'var(--stroke, #e5e7eb)' }}>
                                        <span className="text-[12px] font-bold" style={{ color: 'var(--primary-color, #2563eb)' }}>
                                            {dish.price_range}
                                        </span>
                                        <SpiceIndicator level={dish.spice_level ?? 0} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </>
    )
}

export default CuisineDiscoveryLayout
