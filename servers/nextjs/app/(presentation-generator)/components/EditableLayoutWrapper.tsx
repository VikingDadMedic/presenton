"use client";

import React, { ReactNode, useRef, useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { updateSlideImage, updateSlideIcon, updateImageProperties, updateSlideContent } from '@/store/slices/presentationGeneration';
import ImageEditor from './ImageEditor';
import IconsEditor from './IconsEditor';
import ChartDataEditor, { ChartColumn } from '../presentation/components/ChartDataEditor';

interface EditableLayoutWrapperProps {
    children: ReactNode;
    slideIndex: number;
    slideData: any;
    isEditMode?: boolean;
    properties?: any;
    
}

interface EditableElement {
    id: string;
    type: 'image' | 'icon' | 'chart';
    src: string;
    dataPath: string;
    data: any;
    element: HTMLImageElement | SVGElement;
}

interface ChartDataInfo {
    type: 'simple' | 'series' | 'scatter';
    dataPath: string;
    flatData: Record<string, string>[];
    columns: ChartColumn[];
    rawChart?: any;
}

function findChartDataInContent(obj: any, path: string = ''): ChartDataInfo[] {
    if (!obj || typeof obj !== 'object') return [];
    const results: ChartDataInfo[] = [];

    if (
        Array.isArray(obj.categories) &&
        obj.categories.length > 0 &&
        Array.isArray(obj.series) &&
        obj.series.length > 0 &&
        obj.series[0]?.values
    ) {
        results.push({
            type: 'series',
            dataPath: path,
            flatData: obj.categories.map((cat: string, i: number) => {
                const row: Record<string, string> = { category: String(cat) };
                obj.series.forEach((s: any) => {
                    row[s.name] = String(s.values?.[i] ?? 0);
                });
                return row;
            }),
            columns: [
                { key: 'category', label: 'Category', type: 'string' },
                ...obj.series.map((s: any) => ({
                    key: s.name,
                    label: s.name,
                    type: 'number' as const,
                })),
            ],
            rawChart: obj,
        });
        return results;
    }

    if (Array.isArray(obj.data) && obj.data.length > 0 && typeof obj.data[0] === 'object') {
        const first = obj.data[0];
        const dataPath = path ? `${path}.data` : 'data';
        if ('name' in first && 'value' in first) {
            results.push({
                type: 'simple',
                dataPath,
                flatData: obj.data.map((d: any) => ({ name: String(d.name), value: String(d.value) })),
                columns: [
                    { key: 'name', label: 'Name', type: 'string' },
                    { key: 'value', label: 'Value', type: 'number' },
                ],
            });
            return results;
        }
        if ('x' in first && 'y' in first) {
            results.push({
                type: 'scatter',
                dataPath,
                flatData: obj.data.map((d: any) => ({ x: String(d.x), y: String(d.y) })),
                columns: [
                    { key: 'x', label: 'X', type: 'number' },
                    { key: 'y', label: 'Y', type: 'number' },
                ],
            });
            return results;
        }
    }

    for (const [key, value] of Object.entries(obj)) {
        if (key.startsWith('__') && key.endsWith('__')) continue;
        const newPath = path ? `${path}.${key}` : key;

        if (Array.isArray(value)) {
            if (value.length > 0 && typeof value[0] === 'object') {
                const first = value[0];
                if ('name' in first && 'value' in first && typeof first.value === 'number') {
                    results.push({
                        type: 'simple',
                        dataPath: newPath,
                        flatData: value.map((d: any) => ({ name: String(d.name), value: String(d.value) })),
                        columns: [
                            { key: 'name', label: 'Name', type: 'string' },
                            { key: 'value', label: 'Value', type: 'number' },
                        ],
                    });
                    continue;
                }
                if ('x' in first && 'y' in first && typeof first.x === 'number') {
                    results.push({
                        type: 'scatter',
                        dataPath: newPath,
                        flatData: value.map((d: any) => ({ x: String(d.x), y: String(d.y) })),
                        columns: [
                            { key: 'x', label: 'X', type: 'number' },
                            { key: 'y', label: 'Y', type: 'number' },
                        ],
                    });
                    continue;
                }
            }
            for (let i = 0; i < value.length; i++) {
                if (value[i] && typeof value[i] === 'object') {
                    results.push(...findChartDataInContent(value[i], `${newPath}[${i}]`));
                }
            }
        } else if (value && typeof value === 'object') {
            results.push(...findChartDataInContent(value as any, newPath));
        }
    }

    return results;
}

const EditableLayoutWrapper: React.FC<EditableLayoutWrapperProps> = ({
    children,
    slideIndex,
    slideData,
    properties,
    
}) => {
    const dispatch = useDispatch();
    const containerRef = useRef<HTMLDivElement>(null);
    const [editableElements, setEditableElements] = useState<EditableElement[]>([]);
    const [activeEditor, setActiveEditor] = useState<EditableElement | null>(null);

    /**
     * Recursively searches for ALL image/icon data paths in the slide data structure
     */
    const findAllDataPaths = (targetUrl: string, data: any, path: string = ''): { path: string; type: 'image' | 'icon'; data: any }[] => {
        if (!data || typeof data !== 'object') return [];

        const matches: { path: string; type: 'image' | 'icon'; data: any }[] = [];

        // Check current level for __image_url__ or __icon_url__
        if (data.__image_url__ && targetUrl.includes(data.__image_url__)) {
            matches.push({ path, type: 'image', data });
        }

        if (data.__icon_url__ && targetUrl.includes(data.__icon_url__)) {
            matches.push({ path, type: 'icon', data });
        }

        // Recursively check nested objects and arrays
        for (const [key, value] of Object.entries(data)) {
            const newPath = path ? `${path}.${key}` : key;

            if (Array.isArray(value)) {
                for (let i = 0; i < value.length; i++) {
                    const results = findAllDataPaths(targetUrl, value[i], `${newPath}[${i}]`);
                    matches.push(...results);
                }
            } else if (value && typeof value === 'object') {
                const results = findAllDataPaths(targetUrl, value, newPath);
                matches.push(...results);
            }
        }

        return matches;
    };

    /**
     * Finds the best matching data path for a specific DOM element
     */
    const findBestDataPath = (targetUrl: string, imgElement: HTMLImageElement | SVGElement, data: any): { path: string; type: 'image' | 'icon'; data: any } | null => {
        const allMatches = findAllDataPaths(targetUrl, data);

        if (allMatches.length === 0) return null;
        if (allMatches.length === 1) return allMatches[0];

        // If multiple matches, use DOM position to find the correct one across images and svgs
        const getElementSourceUrl = (el: Element): string | null => {
            if (el instanceof HTMLImageElement) {
                return el.src || null;
            }
            if (el instanceof SVGElement) {
                const wrapperWithUrl = (el as unknown as HTMLElement).closest('[data-path]') as HTMLElement | null;
                return wrapperWithUrl?.getAttribute('data-path') || null;
            }
            return null;
        };

        const allMediaInContainer = containerRef.current?.querySelectorAll('img, svg') || [] as unknown as NodeListOf<Element>;
        const imgIndex = Array.from(allMediaInContainer).indexOf(imgElement as Element);

        // Find images with the same URL pattern
        const sameUrlElements: Element[] = [];
        allMediaInContainer.forEach((el) => {
            const elUrl = getElementSourceUrl(el);
            if (elUrl && isMatchingUrl(elUrl, targetUrl)) {
                sameUrlElements.push(el);
            }
        });

        const sameUrlIndex = sameUrlElements.indexOf(imgElement as Element);

        // Try to match based on position in the same URL group
        if (sameUrlIndex >= 0 && sameUrlIndex < allMatches.length) {
            return allMatches[sameUrlIndex];
        }

        // Fallback: try to match based on overall DOM position
        if (imgIndex >= 0 && imgIndex < allMatches.length) {
            return allMatches[imgIndex];
        }

        // Last resort: return the first match
        return allMatches[0];
    };

    /**
     * Checks if two URLs match using various comparison strategies
     */
    const isMatchingUrl = (url1: string, url2: string): boolean => {
        if (!url1 || !url2) return false;

        // Direct match
        if (url1 === url2) return true;

        // Remove protocol and domain differences
        const cleanUrl1 = url1 && url1.replace(/^https?:\/\/[^\/]+/, '').replace(/^\/+/, '');
        const cleanUrl2 = url2 && url2.replace(/^https?:\/\/[^\/]+/, '').replace(/^\/+/, '');

        if (cleanUrl1 === cleanUrl2) return true;

        // Handle placeholder URLs - be more specific
        if ((url1.includes('placeholder') && url2.includes('placeholder')) ||
            (url1.includes('/static/images/') && url2.includes('/static/images/'))) {
            return url1 === url2; // Require exact match for placeholders
        }

        // Handle app_data paths - be more specific about filename matching
        if (url1.includes('/app_data/') || url2.includes('/app_data/')) {
            const getFilename = (path: string) => path.split('/').pop() || '';
            const filename1 = getFilename(url1);
            const filename2 = getFilename(url2);
            if (filename1 === filename2 && filename1 !== '' && filename1.length > 10) { // Ensure significant filename
                return true;
            }
        }

        // Extract and compare filenames for other URLs - be more restrictive
        const getFilename = (path: string) => path.split('/').pop() || '';
        const filename1 = getFilename(url1);
        const filename2 = getFilename(url2);

        if (filename1 === filename2 && filename1 !== '' && filename1.length > 10) { // Ensure significant filename
            return true;
        }

        return false; // Remove the overly permissive substring matching
    };

    /**
     * Finds and processes images in the DOM, making them editable
     */
    const findAndProcessImages = () => {
        if (!containerRef.current) return;

        const imgElements = containerRef.current.querySelectorAll('img:not([data-editable-processed])');
        const svgElements = containerRef.current.querySelectorAll('svg:not([data-editable-processed])');
        const newEditableElements: EditableElement[] = [];

        imgElements.forEach((img, index) => {
            const htmlImg = img as HTMLImageElement;
            const src = htmlImg.src;

            if (src) {
                const result = findBestDataPath(src, htmlImg, slideData);

                if (result) {
                    const { path: dataPath, type, data } = result;

                    // Mark as processed to prevent re-processing
                    htmlImg.setAttribute('data-editable-processed', 'true');

                    // Add a unique identifier to help with debugging
                    htmlImg.setAttribute('data-editable-id', `${slideIndex}-${type}-${dataPath}-${index}`);

                    const editableElement: EditableElement = {
                        id: `${slideIndex}-${type}-${dataPath}-${index}`,
                        type,
                        src,
                        dataPath,
                        data,
                        element: htmlImg
                    };

                    newEditableElements.push(editableElement);

                    // Add click handler directly to the image
                    const clickHandler = (e: Event) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setActiveEditor(editableElement);
                    };

                    htmlImg.addEventListener('click', clickHandler);

                    const itemIndex = parseInt(`${slideIndex}-${type}-${dataPath}-${index}`.split('-').pop() || '0');
                    const propertiesData = properties?.[itemIndex];

                    // Add hover effects without changing layout
                    htmlImg.style.cursor = 'pointer';
                    htmlImg.style.transition = 'opacity 0.2s, transform 0.2s';
                    htmlImg.style.objectFit = propertiesData?.initialObjectFit;
                    htmlImg.style.objectPosition = `${propertiesData?.initialFocusPoint?.x}% ${propertiesData?.initialFocusPoint?.y}%`;

                    const mouseEnterHandler = () => {
                        htmlImg.style.opacity = '0.8';

                    };

                    const mouseLeaveHandler = () => {
                        htmlImg.style.opacity = '1';

                    };

                    htmlImg.addEventListener('mouseenter', mouseEnterHandler);
                    htmlImg.addEventListener('mouseleave', mouseLeaveHandler);

                    // Store cleanup functions
                    (htmlImg as any)._editableCleanup = () => {
                        htmlImg.removeEventListener('click', clickHandler);
                        htmlImg.removeEventListener('mouseenter', mouseEnterHandler);
                        htmlImg.removeEventListener('mouseleave', mouseLeaveHandler);
                        htmlImg.style.cursor = '';
                        htmlImg.style.transition = '';
                        htmlImg.style.opacity = '';
                        htmlImg.style.transform = '';
                        htmlImg.removeAttribute('data-editable-processed');
                    };
                }
            }
        });
        
        // Process SVG icons
        svgElements.forEach((svg, index) => {
            const svgEl = svg as SVGElement;
            const wrapperWithUrl = (svgEl as unknown as HTMLElement).closest('[data-path]') as HTMLElement | null;
            const src = wrapperWithUrl?.getAttribute('data-path') || '';

            if (src) {
                const result = findBestDataPath(src, svgEl, slideData);

                if (result && result.type === 'icon') {
                    const { path: dataPath, data } = result;

                    // Mark as processed to prevent re-processing
                    svgEl.setAttribute('data-editable-processed', 'true');

                    // Add a unique identifier to help with debugging
                    svgEl.setAttribute('data-editable-id', `${slideIndex}-icon-${dataPath}-svg-${index}`);

                    const editableElement: EditableElement = {
                        id: `${slideIndex}-icon-${dataPath}-svg-${index}`,
                        type: 'icon',
                        src,
                        dataPath,
                        data,
                        element: svgEl
                    };

                    newEditableElements.push(editableElement);

                    // Add click handler directly to the svg
                    const clickHandler = (e: Event) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setActiveEditor(editableElement);
                    };

                    svgEl.addEventListener('click', clickHandler);

                    // Add hover effects without changing layout
                    (svgEl as unknown as HTMLElement).style.cursor = 'pointer';
                    (svgEl as unknown as HTMLElement).style.transition = 'opacity 0.2s, transform 0.2s';

                    const mouseEnterHandler = () => {
                        (svgEl as unknown as HTMLElement).style.opacity = '0.8';
                    };

                    const mouseLeaveHandler = () => {
                        (svgEl as unknown as HTMLElement).style.opacity = '1';
                    };

                    svgEl.addEventListener('mouseenter', mouseEnterHandler as any);
                    svgEl.addEventListener('mouseleave', mouseLeaveHandler as any);

                    // Store cleanup functions
                    (svgEl as any)._editableCleanup = () => {
                        svgEl.removeEventListener('click', clickHandler);
                        svgEl.removeEventListener('mouseenter', mouseEnterHandler as any);
                        svgEl.removeEventListener('mouseleave', mouseLeaveHandler as any);
                        (svgEl as unknown as HTMLElement).style.cursor = '';
                        (svgEl as unknown as HTMLElement).style.transition = '';
                        (svgEl as unknown as HTMLElement).style.opacity = '';
                        (svgEl as unknown as HTMLElement).style.transform = '';
                        svgEl.removeAttribute('data-editable-processed');
                    };
                }
            }
        });


        // Process Recharts chart SVGs
        const rechartsElements = containerRef.current.querySelectorAll('svg.recharts-surface:not([data-editable-processed])');
        if (rechartsElements.length > 0) {
            const chartDataList = findChartDataInContent(slideData);
            let chartMatchIdx = 0;

            rechartsElements.forEach((el, index) => {
                if (chartMatchIdx >= chartDataList.length) return;
                const svgEl = el as SVGElement;
                svgEl.setAttribute('data-editable-processed', 'true');

                const chartInfo = chartDataList[chartMatchIdx];
                chartMatchIdx++;

                const editableElement: EditableElement = {
                    id: `${slideIndex}-chart-${chartInfo.dataPath}-${index}`,
                    type: 'chart',
                    src: '',
                    dataPath: chartInfo.dataPath,
                    data: chartInfo,
                    element: svgEl,
                };

                newEditableElements.push(editableElement);

                const wrapper = (svgEl.closest('.recharts-wrapper') || svgEl.parentElement) as HTMLElement;
                const clickHandler = (e: Event) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setActiveEditor(editableElement);
                };

                wrapper.addEventListener('click', clickHandler);
                wrapper.style.cursor = 'pointer';
                wrapper.style.transition = 'opacity 0.2s';

                const mouseEnterHandler = () => { wrapper.style.opacity = '0.85'; };
                const mouseLeaveHandler = () => { wrapper.style.opacity = '1'; };
                wrapper.addEventListener('mouseenter', mouseEnterHandler);
                wrapper.addEventListener('mouseleave', mouseLeaveHandler);

                (svgEl as any)._editableCleanup = () => {
                    wrapper.removeEventListener('click', clickHandler);
                    wrapper.removeEventListener('mouseenter', mouseEnterHandler);
                    wrapper.removeEventListener('mouseleave', mouseLeaveHandler);
                    wrapper.style.cursor = '';
                    wrapper.style.transition = '';
                    wrapper.style.opacity = '';
                    svgEl.removeAttribute('data-editable-processed');
                };
            });
        }

        setEditableElements(prev => [...prev, ...newEditableElements]);
    };

    /**
     * Cleanup function to remove event listeners and reset styles
     */
    const cleanupElements = () => {
        editableElements.forEach(({ element }) => {
            if ((element as any)._editableCleanup) {
                (element as any)._editableCleanup();
            }
        });
        setEditableElements([]);
    };

    // Wait for LoadableComponent to render and then process images
    useEffect(() => {
        const timer = setTimeout(() => {
            findAndProcessImages();
        }, 400);

        return () => {
            clearTimeout(timer);
            cleanupElements();
        };
    }, [slideData, children]);

    // Re-run when container content changes
    useEffect(() => {
        if (!containerRef.current) return;

        const observer = new MutationObserver((mutations) => {
            const hasNewMedia = mutations.some(mutation =>
                Array.from(mutation.addedNodes).some(node =>
                    node.nodeType === Node.ELEMENT_NODE &&
                    (
                        (node as Element).tagName === 'IMG' ||
                        (node as Element).tagName === 'SVG' ||
                        (node as Element).querySelector('img:not([data-editable-processed]), svg:not([data-editable-processed])')
                    )
                )
            );

            if (hasNewMedia) {
                setTimeout(findAndProcessImages, 100);
            }
        });

        observer.observe(containerRef.current, {
            childList: true,
            subtree: true
        });

        return () => observer.disconnect();
    }, [slideData]);

    /**
     * Handles closing the active editor
     */
    const handleEditorClose = () => {
        setActiveEditor(null);
    };

    /**
     * Handles image change from ImageEditor
     */
    const handleImageChange = (newImageUrl: string, prompt?: string) => {
        if (activeEditor && activeEditor.element) {


            // Update the DOM element immediately for visual feedback
            (activeEditor.element as HTMLImageElement).src = newImageUrl;

            // Update Redux store
            dispatch(updateSlideImage({
                slideIndex,
                dataPath: activeEditor.dataPath,
                imageUrl: newImageUrl,
                prompt: prompt || activeEditor.data?.__image_prompt__ || ''
            }));
            setActiveEditor(null);
        }
    };
    /**
     * Handles icon change from IconsEditor
     */
    const handleIconChange = (newIconUrl: string, query?: string) => {
        console.log('newIconUrl', newIconUrl);
        if (activeEditor && activeEditor.element) {
            // Update Redux store
            dispatch(updateSlideIcon({
                slideIndex,
                dataPath: activeEditor.dataPath,
                iconUrl: newIconUrl,
                query: query || activeEditor.data?.__icon_query__ || ''
            }));



        }
    };
    const handleFocusPointClick = (propertiesData: any) => {

        const id = activeEditor?.id;
        const editableId = document.querySelector(`[data-editable-id="${id}"]`);

        if (editableId) {
            const editableElement = editableId as HTMLImageElement;
            editableElement.style.objectFit = propertiesData.initialObjectFit;
            editableElement.style.objectPosition = `${propertiesData.initialFocusPoint.x}% ${propertiesData.initialFocusPoint.y}%`;
        }

        dispatch(updateImageProperties({
            slideIndex,
            itemIndex: parseInt(activeEditor?.id.split('-').pop() || '0'),
            properties: propertiesData
        }));

    };

    const handleChartSave = (newData: any[]) => {
        if (!activeEditor || activeEditor.type !== 'chart') return;
        const chartInfo = activeEditor.data as ChartDataInfo;

        if (chartInfo.type === 'series' && chartInfo.rawChart) {
            const updatedChart = {
                ...chartInfo.rawChart,
                categories: newData.map(row => row.category),
                series: chartInfo.rawChart.series.map((s: any) => ({
                    ...s,
                    values: newData.map(row => Number(row[s.name]) || 0),
                })),
            };
            dispatch(updateSlideContent({
                slideIndex,
                dataPath: chartInfo.dataPath,
                content: updatedChart,
            }));
        } else {
            dispatch(updateSlideContent({
                slideIndex,
                dataPath: chartInfo.dataPath,
                content: newData,
            }));
        }

        setActiveEditor(null);
    };

    return (
        <div ref={containerRef} className="editable-layout-wrapper w-full ">
            {children}

            {/* Render ImageEditor when an image is being edited */}
            {activeEditor && activeEditor.type === 'image' && (
                <ImageEditor
                    initialImage={activeEditor.src}
                    slideIndex={slideIndex}
                    promptContent={activeEditor.data?.__image_prompt__ || ''}
                    imageIdx={0}
                    properties={null}
                    onClose={handleEditorClose}
                    onImageChange={handleImageChange}
                    onFocusPointClick={handleFocusPointClick}
                >
                </ImageEditor>
            )}

            {/* Render IconsEditor when an icon is being edited */}
            {activeEditor && activeEditor.type === 'icon' && (
                <IconsEditor
                    icon_prompt={activeEditor.data?.__icon_query__ ? [activeEditor.data.__icon_query__] : []}
                    onClose={handleEditorClose}
                    onIconChange={handleIconChange}
                >

                </IconsEditor>
            )}

            {/* Render ChartDataEditor when a chart is being edited */}
            {activeEditor && activeEditor.type === 'chart' && (
                <ChartDataEditor
                    isOpen={true}
                    onClose={handleEditorClose}
                    data={(activeEditor.data as ChartDataInfo).flatData}
                    columns={(activeEditor.data as ChartDataInfo).columns}
                    onSave={handleChartSave}
                />
            )}
        </div>
    );
};

export default EditableLayoutWrapper;