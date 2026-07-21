package com.pkrandomizerweb;

import com.dabomstew.pkrandom.Settings;

import java.io.FileInputStream;

/**
 * Dev-only sanity check (not part of the shipped shim): reads a .rnqs
 * settings file back via the real Settings.read() and prints a few fields,
 * to confirm SettingsBuilder's output round-trips through the format
 * CliRandomizer itself will parse.
 */
public class RoundTripCheck {
    public static void main(String[] args) throws Exception {
        try (FileInputStream in = new FileInputStream(args[0])) {
            Settings settings = Settings.read(in);
            System.out.println("Read OK.");
            System.out.println("romName=" + settings.getRomName());
            System.out.println("baseStatisticsMod=" + settings.getBaseStatisticsMod());
            System.out.println("startersMod=" + settings.getStartersMod());
            System.out.println("typesMod=" + settings.getTypesMod());
            System.out.println("trainersMod=" + settings.getTrainersMod());
            System.out.println("currentRestrictions.allow_gen1=" + settings.getCurrentRestrictions().allow_gen1);
            System.out.println("currentRestrictions.allow_gen2=" + settings.getCurrentRestrictions().allow_gen2);
            System.out.println("currentRestrictions.allow_gen3=" + settings.getCurrentRestrictions().allow_gen3);
            System.out.println("currentMiscTweaks=" + settings.getCurrentMiscTweaks());
        }
    }
}
