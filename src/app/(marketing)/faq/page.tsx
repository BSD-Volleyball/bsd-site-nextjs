import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from "@/components/ui/accordion"

export const metadata = {
    title: "FAQ - Bump Set Drink Volleyball",
    description: "Frequently asked questions about the BSD Volleyball League"
}

const faqs = [
    {
        question: "Why does the BSD draft process sometimes seem more like an evaluation of 'who you know' than 'how you play'?",
        answer: "The league employs a draft system where captains assemble teams across skill divisions. While some players perceive favoritism, the reality involves multiple factors: division boundaries must exist somewhere, captains consider team composition needs beyond raw skill, and personality fit matters. BSD implements safeguards including recruiting new captains and monitoring for non-competitive behavior. The organization acknowledges that lines have to be drawn somewhere and suggests players consider whether being a top performer in a lower division might offer better experience than struggling in a higher one."
    },
    {
        question: "Why should I continue to play volleyball in the BSD league?",
        answer: "BSD distinguishes itself through several advantages: (1) The draft system reshuffles players annually, preventing dominant teams from monopolizing divisions—unlike traditional rec leagues where teams register and stay intact. (2) Players meet new teammates seasonally through the draft mechanism. (3) The league features the longest and most competitive playoff season with a three-week double-elimination format. (4) Every drafted player receives guaranteed playing time rotating through all positions, unlike other leagues that sit players or limit rotations."
    }
]

export default function FAQPage() {
    return (
        <div className="container mx-auto max-w-4xl px-4 py-16">
            <div className="mb-12 text-center">
                <h1 className="mb-4 font-bold text-4xl tracking-tight">
                    Frequently Asked Questions
                </h1>
                <p className="text-lg text-muted-foreground">
                    Common questions about the BSD Volleyball League
                </p>
            </div>

            <Accordion type="single" collapsible className="w-full">
                {faqs.map((faq, index) => (
                    <AccordionItem key={index} value={`item-${index}`}>
                        <AccordionTrigger className="text-left text-lg">
                            {faq.question}
                        </AccordionTrigger>
                        <AccordionContent className="text-muted-foreground leading-relaxed">
                            {faq.answer}
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
        </div>
    )
}
