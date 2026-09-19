package in.pms.channels;

import in.pms.jobs.JobRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Every 15 minutes, pull every OTA calendar of every property. The work lives in {@link ChannelSync}. */
@Component
@ConditionalOnProperty(name = "pms.jobs.enabled", havingValue = "true", matchIfMissing = true)
public class ChannelSyncJob {
    private final JobRunner runner;
    private final ChannelService channels;
    private final ChannelSync sync;

    public ChannelSyncJob(JobRunner runner, ChannelService channels, ChannelSync sync) {
        this.runner = runner; this.channels = channels; this.sync = sync;
    }

    // Offset from the quarter hour so it does not start in the same second as the no-show job.
    @Scheduled(cron = "30 7/15 * * * *")
    public void tick() {
        runner.forEachProperty("channel_sync", p -> channels.importLinks().forEach(sync::sync));
    }
}
