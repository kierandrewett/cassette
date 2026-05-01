import { DescriptionClient } from "./DescriptionClient";

interface DescriptionProps {
    text: string;
}

/**
 * Server component wrapper for the video description.
 * Delegates interactive rendering (timestamp clicks, show-more toggle)
 * to the DescriptionClient client component.
 */
export const Description = ({ text }: DescriptionProps) => {
    if (!text) {
        return <p className="text-sm italic text-muted-foreground">No description.</p>;
    }

    return <DescriptionClient text={text} />;
};
