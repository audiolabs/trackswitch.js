export function requestText(url: string, sourceLabel: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const request = new XMLHttpRequest();
		request.open("GET", url, true);

		request.onreadystatechange = () => {
			if (request.readyState !== 4) {
				return;
			}

			if (request.status >= 200 && request.status < 300) {
				resolve(String(request.responseText ?? request.response ?? ""));
			} else {
				reject(new Error(`Failed to request ${sourceLabel}: ${url}`));
			}
		};

		request.onerror = () => {
			reject(
				new Error(`Network error while requesting ${sourceLabel}: ${url}`),
			);
		};

		request.send();
	});
}
