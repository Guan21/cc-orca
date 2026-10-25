# DevCrew isolated GitHub QA seed

This directory is the ROOT of a FUTURE dedicated PRIVATE QA repository. It intentionally contains only synthetic data and no DevCrew source code or secrets.

How to use: create an empty private repository Guan21/devcrew-personal-pilot-qa, push this seed to main, open one PR from pilot/one-pr adding a harmless text file, and observe GitHub's real PR/HEAD/Check metadata. Alternatively use ../operator/setup-private-qa.ps1 from PowerShell 7.

The GitHub Actions workflow runs two harmless test cases with Node built-in tests. A second check appears only when the PR title contains [CI-FAIL] and then intentionally fails. Changing the title back creates a new check outcome; avoid assuming a previous result still describes the current HEAD.

Do not place real credentials or private DevCrew data in this test repository. A private repo is required as a test isolation boundary, but repository creation and CI do not authorize the DevCrew app to use GitHub Source.

Owner-controlled #151 exact-SHA approval, effective native Principal/Credential/Keyring custody, complete lifecycle ordering, immutable repository registration, native confinement and Repo/Checks ACL are prerequisites before any application real-source request. #153 installed native QA remains NOT EXERCISED.
