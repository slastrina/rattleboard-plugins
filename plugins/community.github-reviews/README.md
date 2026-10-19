# GitHub reviews

Three numbers from your GitHub account: pull requests waiting for your review, your own open pull requests, and unread notifications. The corner is red while a review is waiting for you, yellow when there are only unread notifications, and green when there's nothing. Click the board to open your pull requests on GitHub.

Settings:
- Only in this organisation or user (optional): count only pull requests there, like `slastrina`.
- GitHub personal access token: make one at github.com → Settings → Developer settings → Personal access tokens. A classic token with the `repo` scope (for private repositories) and `notifications` scope shows all three numbers; a fine-grained token works too, but GitHub doesn't let those read notifications, so Unread shows a dash. The token is kept in your device's credential store and only ever sent to api.github.com.

Notes:
- Data: the GitHub REST API (search and notifications). It checks every 5 minutes: 3 requests, well within GitHub's limits.
- This is a script plugin (Rattleboard 0.8.0 or later). It only contacts api.github.com.
