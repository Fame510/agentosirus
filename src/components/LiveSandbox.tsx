import { useState, useEffect } from "react";
import { RotateCcw, Sparkles } from "lucide-react";

interface LiveSandboxProps {
  content: string;
}

export function LiveSandbox({ content }: LiveSandboxProps) {
  const [htmlCode, setHtmlCode] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"code" | "preview">("preview");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    // Extract HTML code block using regex
    const htmlBlockRegex = /```html\n([\s\S]*?)\n```/i;
    const match = content.match(htmlBlockRegex);
    
    if (match && match[1]) {
      setHtmlCode(match[1]);
    } else {
      // Fallback: search for any code block or plain HTML tags like <!DOCTYPE or <html> or <div
      const genericBlockRegex = /```(?:xml|xml-dtd|html|svg)?\n([\s\S]*?)\n```/i;
      const genericMatch = content.match(genericBlockRegex);
      if (genericMatch && genericMatch[1] && (genericMatch[1].includes("<div") || genericMatch[1].includes("<html") || genericMatch[1].includes("<p"))) {
        setHtmlCode(genericMatch[1]);
      } else if (content.includes("<html") || (content.includes("<div") && content.includes("class="))) {
        // Strip other markdown stuff or just use the whole text if it's mostly HTML
        setHtmlCode(content);
      } else {
        setHtmlCode(null);
      }
    }
  }, [content]);

  if (!htmlCode) return null;

  // Compile full iframe srcDoc with Tailwind CSS CDN, Font families and standard scripts included
  const compiledSrcDoc = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Hosted App Sandbox</title>
        <!-- Tailwind CSS Play CDN -->
        <script src="https://cdn.tailwindcss.com"></script>
        <!-- Font Awesome Icons -->
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <!-- Inter and Outfit Google Fonts -->
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
        <script>
          tailwind.config = {
            theme: {
              extend: {
                fontFamily: {
                  sans: ['Inter', 'ui-sans-serif', 'system-ui'],
                  display: ['Outfit', 'Inter', 'sans-serif'],
                }
              }
            }
          }
        </script>
        <style>
          body {
            font-family: 'Inter', sans-serif;
            margin: 0;
            padding: 0;
          }
        </style>
      </head>
      <body class="bg-slate-50 text-slate-900">
        ${htmlCode.includes("<body") ? htmlCode.replace(/<body[^>]*>|<\/body>/gi, "") : htmlCode}
      </body>
    </html>
  `;

  return (
    <div className="mt-4 border border-indigo-100 rounded-xl bg-slate-950 overflow-hidden shadow-md animate-fade-in">
      {/* Header Browser-Mockup bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          {/* Mac-like dots */}
          <span className="w-3 h-3 rounded-full bg-rose-500 inline-block" />
          <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
          <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
          
          <span className="ml-2 bg-slate-950 text-[10px] text-indigo-400 font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded border border-slate-800/80 flex items-center gap-1.5">
            <Sparkles size={12} className="text-indigo-400" />
            <span>Hosted Sandbox App Preview</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("preview")}
            className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
              activeTab === "preview"
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Live App
          </button>
          
          <button
            onClick={() => setActiveTab("code")}
            className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
              activeTab === "code"
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Raw Code
          </button>

          <button
            onClick={() => setRefreshKey(prev => prev + 1)}
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Reload Sandbox Container"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* Main Container Sandbox Stage */}
      <div className="bg-white">
        {activeTab === "preview" ? (
          <div className="h-[450px] relative w-full bg-slate-50">
            <iframe
              key={refreshKey}
              srcDoc={compiledSrcDoc}
              title="Hosted Live App Preview"
              sandbox="allow-scripts allow-popups allow-modals allow-forms"
              className="w-full h-full border-0 bg-white"
            />
          </div>
        ) : (
          <div className="h-[450px] overflow-auto bg-slate-950 text-slate-300 font-mono text-xs p-5 border-t border-slate-900 leading-relaxed">
            <pre><code>{htmlCode}</code></pre>
          </div>
        )}
      </div>
      
      {/* Footer descriptor bar */}
      <div className="bg-slate-900 border-t border-slate-800 px-4 py-2 flex items-center justify-between text-[10px] text-slate-400 font-mono">
        <span>Framework Integration: Tailwind CDN, FontAwesome, Outfit display, client-side scripts</span>
        <span>Secure Iframe Isolation</span>
      </div>
    </div>
  );
}
