import {
	isRouteErrorResponse,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	useRouteError,
} from 'react-router'
import './index.css'

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<Meta />
				<Links />
			</head>
			<body>
				{children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	)
}

export default function App() {
	return <Outlet />
}

// Root boundary (ADR-0008): last resort, whole-document replacement.
export function ErrorBoundary() {
	const error = useRouteError()
	const known = isRouteErrorResponse(error)
	return (
		<main className="p-8">
			<h1 className="text-xl font-semibold">
				{known ? `${error.status} ${error.statusText}` : 'Oops!'}
			</h1>
			{import.meta.env.DEV && error instanceof Error && (
				<pre className="mt-4 text-sm">{error.stack}</pre>
			)}
		</main>
	)
}
