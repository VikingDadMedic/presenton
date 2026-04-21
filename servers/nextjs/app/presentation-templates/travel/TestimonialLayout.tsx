import React from 'react'
import * as z from "zod";
import { ImageSchema } from '../defaultSchemes';
import TravelFonts from './TravelFonts';

export const layoutId = 'travel-testimonial'
export const layoutName = 'Testimonial'
export const layoutDescription = 'A slide layout featuring a traveler review with a large quote, traveler photo, name, trip details, and star rating. Perfect for social proof in travel presentations.'

const testimonialSchema = z.object({
    quote: z.string().min(20).max(200).default('This trip completely exceeded our expectations. From the stunning sunsets in Santorini to the incredible local cuisine, every moment felt like a dream come true. Truly a once-in-a-lifetime experience!').meta({
        description: "The traveler review or testimonial quote",
    }),
    traveler_name: z.string().min(2).max(40).default('Sarah Mitchell').meta({
        description: "Full name of the traveler",
    }),
    trip_name: z.string().min(3).max(50).default('Greek Islands Explorer — 10 Day Tour').meta({
        description: "Name or title of the trip taken",
    }),
    rating: z.number().min(1).max(5).default(5).meta({
        description: "Trip rating from 1 to 5 stars",
    }),
    image: ImageSchema.default({
        __image_url__: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80',
        __image_prompt__: 'Happy traveler portrait smiling outdoors',
    }).meta({
        description: "Portrait photo of the traveler",
    }),
})

export const Schema = testimonialSchema

type TestimonialData = z.infer<typeof testimonialSchema>

interface TestimonialLayoutProps {
    data?: Partial<TestimonialData>
}

const TestimonialLayout: React.FC<TestimonialLayoutProps> = ({ data: slideData }) => {
    const rating = slideData?.rating || 5

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

                <div className="absolute top-0 left-0 w-96 h-96 rounded-full opacity-[0.07]" style={{ background: 'var(--primary-color, #2563eb)', filter: 'blur(100px)' }} />
                <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full opacity-[0.07]" style={{ background: 'var(--primary-color, #2563eb)', filter: 'blur(100px)' }} />

                <div className="relative z-10 px-8 sm:px-12 lg:px-20 h-full flex flex-col items-center justify-center">
                    <svg
                        className="w-16 h-16 mb-6 opacity-20"
                        fill="var(--primary-color, #2563eb)"
                        viewBox="0 0 24 24"
                    >
                        <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
                    </svg>

                    <blockquote
                        className="text-xl sm:text-2xl lg:text-3xl font-medium text-center leading-relaxed italic max-w-4xl"
                        style={{ color: 'var(--background-text, #111827)' }}
                    >
                        &ldquo;{slideData?.quote || 'This trip completely exceeded our expectations. From the stunning sunsets in Santorini to the incredible local cuisine, every moment felt like a dream come true. Truly a once-in-a-lifetime experience!'}&rdquo;
                    </blockquote>

                    <div className="mt-8 flex flex-col items-center gap-4">
                        <div
                            className="w-20 h-20 rounded-full overflow-hidden border-4"
                            style={{ borderColor: 'var(--primary-color, #2563eb)' }}
                        >
                            <img
                                src={slideData?.image?.__image_url__ || ''}
                                alt={slideData?.traveler_name || 'Traveler'}
                                className="w-full h-full object-cover"
                            />
                        </div>

                        <div className="text-center">
                            <p
                                className="text-lg font-bold"
                                style={{ color: 'var(--background-text, #111827)' }}
                            >
                                {slideData?.traveler_name || 'Sarah Mitchell'}
                            </p>
                            <p
                                className="text-sm mt-0.5"
                                style={{
                                    color: 'var(--background-text, #6b7280)',
                                    fontFamily: 'var(--body-font-family, Poppins)',
                                }}
                            >
                                {slideData?.trip_name || 'Greek Islands Explorer — 10 Day Tour'}
                            </p>
                        </div>

                        <div className="flex items-center gap-1">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <svg
                                    key={i}
                                    className="w-5 h-5"
                                    viewBox="0 0 20 20"
                                    fill={i < rating ? 'var(--primary-color, #2563eb)' : 'var(--stroke, #d1d5db)'}
                                >
                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

export default TestimonialLayout
