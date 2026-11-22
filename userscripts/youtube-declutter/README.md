# YouTube Declutter

Trims YouTube down to the parts you use: hides unused sidebar sections, the home feed's topic chips, channel banners and a few other extras, keeps the subscriptions list fully expanded, and opens Shorts in the normal video player.

## Install

Open [youtube-declutter.user.js](https://raw.githubusercontent.com/jcackowski/userscripts/main/userscripts/youtube-declutter/youtube-declutter.user.js) with [Violentmonkey](https://violentmonkey.github.io/) or [Tampermonkey](https://www.tampermonkey.net/) installed.

## Settings

Each feature can be turned off in the `CONFIG` object at the top of the script.

| Setting | What it does |
|---|---|
| `hideHomeAndShortsSection` | Hides the sidebar section with Home and Shorts. |
| `hideMoreFromYouTubeSection` | Hides Premium, YouTube TV, YouTube Music, YouTube Kids and Labs. |
| `hideExploreSection` | Hides Music, Movies & TV, Live and the rest of Explore. |
| `hideReportHistorySection` | Hides the section with Report history. |
| `youSectionKeep` | Links to keep in the **You** section (default: History only). Everything else there, including **Show more**, is hidden. `null` leaves the section alone. |
| `expandSubscriptions` | Opens the full subscriptions list in the sidebar. **Show less** still collapses it. |
| `hideSidebarFooter` | Hides the footer links under the sidebar. |
| `hideFilterChips` | Hides the topic chips above the home feed. |
| `hideCreateButton` | Hides the **Create** button in the top bar. |
| `hideChannelBanner` | Hides the banner image on channel pages. The channel's name, avatar and Subscribe button stay. |
| `hidePlayablesShelf` | Hides the mini-game shelf in the home feed. |
| `hideEngagementPanelScrim` | Stops the page dimming behind side panels on the watch page. |
| `redirectShorts` | Opens Shorts at `/watch?v=<id>` in the normal player. |

## Notes

- Sidebar sections are matched by a link inside them, not by their position, so they stay hidden if YouTube reorders the sidebar.
- **Show more** under Subscriptions is clicked once when the sidebar first appears. If you collapse the list, it stays collapsed until the next full page load.
- The Create button is matched by its `Create` label, so it only hides when YouTube is set to English.
- Redirecting a Short reloads the page.
