# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |

## Reporting a Vulnerability

If you find a security problem in Sonara, please do not open a public issue.

Go to the **Security** tab of this repo, then **Advisories**, then **Report a vulnerability**. That sends it privately so it can be fixed before anyone can misuse it.

Please include:

- What you found and where
- Steps to reproduce it
- What you think the impact is

You will get a reply as soon as possible. Please do not disclose the issue publicly until it is fixed.

## Security notes

Sonara v0.1 has no dependencies and no build step. It is plain HTML, CSS, and JavaScript that talks to the free Audius API over HTTPS. There are no API keys or secrets in the code, and data from the API is rendered as text, never as HTML.
