import React, { useState, useRef, useEffect, useCallback } from "react"
import styles from "./select.css"

interface SelectProps {
    items: {
        title: string | React.ReactElement,
        value?: string,
        onSelect?: () => void
    }[]
    /** Controlled index — when provided the select displays this item. */
    selectedIndex?: number
}

const pullDownIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
)

function MenuComponent({
    items,
    onItemSelect
}: {
    items: SelectProps["items"],
    onItemSelect: (index: number, onSelect?: () => void) => void
}) {
    return (
        <div className={styles['menu-container']}>
            {items.map((item, index) => (
                <div
                    key={index}
                    onClick={() => onItemSelect(index, item.onSelect)}
                >
                    {item.title}
                </div>
            ))}
        </div>
    )
}

export default function Select(props: SelectProps) {
    const [internalIndex, setInternalIndex] = useState<number>(0)
    const [isVisibleMenu, setVisibleMenu] = useState<boolean>(false)
    const containerRef = useRef<HTMLDivElement>(null)

    const current = props.selectedIndex ?? internalIndex

    const toggleVisibleMenu = useCallback(() => {
        setVisibleMenu(prev => !prev)
    }, [])

    const handleItemSelect = useCallback((index: number, onSelect?: () => void) => {
        onSelect?.()
        setInternalIndex(index)
        setVisibleMenu(false)
    }, [])


    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setVisibleMenu(false)
            }
        }

        if (isVisibleMenu) {
            document.addEventListener('mousedown', handleClickOutside)
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [isVisibleMenu])

    const menu = React.useMemo(() => (
        <MenuComponent
            items={props.items}
            onItemSelect={handleItemSelect}
        />
    ), [props.items, handleItemSelect])

    return (
        <div className={styles.container} ref={containerRef}>
            <div className={styles['text-container']} onClick={toggleVisibleMenu}>
                {props.items?.[current]?.title || ""}
                <div className={styles.pulldown}>{pullDownIcon}</div>
            </div>
            {isVisibleMenu && menu}
        </div>
    )
}

export type { SelectProps }
