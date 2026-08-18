"use client"

import { Label } from "@/components/ui/label"

export function SkillSlider({
    label,
    value,
    disabled,
    onChange
}: {
    label: string
    value: number
    disabled: boolean
    onChange: (nextValue: number) => void
}) {
    const ticksId = `skill-ticks-${label.toLowerCase()}`
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between">
                <Label>{label}</Label>
                <span className="font-semibold text-sm">
                    {value.toFixed(1)}
                </span>
            </div>
            <input
                type="range"
                min={0}
                max={6}
                step={0.2}
                value={value}
                onChange={(event) => onChange(Number(event.target.value))}
                disabled={disabled}
                list={ticksId}
                className="h-2 w-full cursor-pointer accent-primary disabled:cursor-not-allowed"
            />
            <datalist id={ticksId}>
                <option value="0" />
                <option value="1" />
                <option value="2" />
                <option value="3" />
                <option value="4" />
                <option value="5" />
                <option value="6" />
            </datalist>
            <div className="flex justify-between px-[0.4rem]">
                {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                    <div key={n} className="h-1.5 w-px bg-border" />
                ))}
            </div>
            <div className="grid grid-cols-6 text-center text-muted-foreground text-sm">
                <span>BB</span>
                <span>BBB</span>
                <span>ABB</span>
                <span>ABA</span>
                <span>A</span>
                <span>AA</span>
            </div>
        </div>
    )
}
