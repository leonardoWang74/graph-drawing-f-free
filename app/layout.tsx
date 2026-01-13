import type {Metadata} from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Graph Drawing: F-Free Editing",
    description: "",
};

export default function RootLayout({children,}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
        <body>
        {children}
        <script defer src="https://cdn.jsdelivr.net/npm/mathjax@4/tex-svg.js"></script>
        </body>
        </html>
    );
}
