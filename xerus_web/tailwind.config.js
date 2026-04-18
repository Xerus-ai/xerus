/** @type {import('tailwindcss').Config} */
module.exports = {
	darkMode: ['class'],
	content: [
		'./components/**/*.{js,ts,jsx,tsx,mdx}',
		'./app/**/*.{js,ts,jsx,tsx,mdx}',
	],
	theme: {
		extend: {
			fontFamily: {
				'sans': ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Helvetica', 'sans-serif'],
				'serif': ['Lora', 'Georgia', 'Times New Roman', 'serif'],
				'mono': ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', 'monospace'],
			},
			colors: {
				// Primary = Dark (buttons, strong actions)
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				// Secondary = Orange (accent buttons, highlights)
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},

				// Surface colors — RGB channels for Tailwind alpha + dark mode
				surface: {
					DEFAULT: 'rgb(var(--clr-surface) / <alpha-value>)',
					alt: 'rgb(var(--clr-surface-alt) / <alpha-value>)',
					hover: 'rgb(var(--clr-surface-hover) / <alpha-value>)',
					active: 'rgb(var(--clr-surface-active) / <alpha-value>)',
					pressed: 'rgb(var(--clr-surface-pressed) / <alpha-value>)',
				},

				// Text — warm brown base with alpha support
				// text-text = #26251e, text-text/55 = Cursor's secondary text
				text: {
					DEFAULT: 'rgb(var(--clr-text) / <alpha-value>)',
					secondary: 'var(--clr-text-secondary)',
					muted: 'var(--clr-text-muted)',
				},

				// Base UI colors
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				success: 'rgb(var(--clr-success) / <alpha-value>)',
				warning: 'rgb(var(--clr-warning) / <alpha-value>)',
				gold: 'rgb(var(--clr-gold) / <alpha-value>)',
				'code-bg': 'rgb(var(--clr-code-bg) / <alpha-value>)',
				'code-border': 'rgb(var(--clr-code-border) / <alpha-value>)',
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				chart: {
					'1': 'hsl(var(--chart-1))',
					'2': 'hsl(var(--chart-2))',
					'3': 'hsl(var(--chart-3))',
					'4': 'hsl(var(--chart-4))',
					'5': 'hsl(var(--chart-5))'
				}
			},
			borderRadius: {
				'sm': '4px',
				'md': '8px',
				'lg': '10px',
				'xl': '12px',
				'2xl': '16px',
				'3xl': '24px',
				'4xl': '32px',
				'pill': '9999px',
			},
			boxShadow: {
				'sm': '0 1px 2px rgba(0,0,0,0.04)',
				'md': '0 2px 8px rgba(0,0,0,0.06)',
				'lg': '0 8px 24px rgba(0,0,0,0.08)',
				'elevated': '0 14px 32px rgba(0,0,0,0.1), 0 28px 70px rgba(0,0,0,0.06)',
			}
		}
	},
	plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
}