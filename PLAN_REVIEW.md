# Quit-date correction (2026-10-02)

## Confirmed defect

`chooseApproach` automatically assigned 84 days when confidence was 3 or below.
This could display 83 remaining days. Confidence is not evidence for that delay.
The old code also generalized a cigarette/varenicline schedule to vaping and hookah.

## Changes

- Advice now asks for a quit date instead of choosing 12 weeks based on confidence.
- Low confidence still increases the recommendation for professional support.
- A 12-week gradual option is restricted to cigarette-only users reporting prescribed varenicline, and explicitly described as a clinician-supervised option, not a required duration.
- Cigarette reduction schedules are not generated for vaping, hookah or mixed use.
- Unsupported saved plans show a review action and retain their saved date and history. No account data is silently migrated or shortened.
- Already-quit users retain their past quit date; follow-up weeks are labelled as after quitting.
- The report distinguishes quit date from treatment duration and removes the universal fixed-strength vaping taper.

## Primary sources checked

- NICE NG209, Treating tobacco dependence: agree a quit date; normally within six weeks of starting behavioural support, sooner is better. This is not a rule to force a fixed duration for everyone.
  https://www.nice.org.uk/guidance/ng209/chapter/treating-tobacco-dependence
- Pfizer CHANTIX prescribing information: gradual reduction to abstinence by 12 weeks is a specific option with varenicline for those unable/unwilling to stop abruptly, with further treatment afterwards.
  https://labeling.pfizer.com/ShowLabeling.aspx?format=PDF&id=557
- NHS How to quit vaping: reduction according to response; increased vaping after reducing strength can indicate too-fast reduction. Does not prescribe a universal 12-week cigarette-derived schedule.
  https://www.nhs.uk/better-health/quit-smoking/ready-to-quit-smoking/vaping-to-quit-smoking/how-to-quit-vaping/

## Limits

This is a focused correction of quit-date selection and unsupported taper schedules, not clinical approval of the app. The remaining dose-selection heuristics, product-specific instructions and mixed-use recommendations still require a qualified smoking-cessation clinician's review before broad public reliance. Passing software tests does not establish clinical validity.

No frontend deployment was performed in this task.
